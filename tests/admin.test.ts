import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import type { Miniflare } from "miniflare";
import { createApp, type Env } from "../src/worker/app";
import type { Db } from "../src/worker/db";
import { findEvent } from "../src/worker/events";
import { register } from "../src/worker/registrations";
import { addRole, eventRoles } from "../src/worker/roles";
import { page, type Page } from "./dom";
import {
  adminCookie,
  event,
  form,
  HOST_TIMEOUT,
  migratedDb,
  ORIGIN,
  seed,
  signedIn,
  testEnv,
} from "./support";

setDefaultTimeout(HOST_TIMEOUT);

const now = new Date("2026-12-01T12:00:00-05:00");
// No test reaches the network: every outside request fails.
const app = createApp({
  now: () => now,
  fetch: async () => new Response("", { status: 503 }),
});

let mf: Miniflare;
let DB: D1Database;
let db: Db;
let MEDIA: R2Bucket;
let env: Env;
let cookie: string;

beforeAll(async () => {
  ({ mf, DB, db, MEDIA } = await migratedDb("admin"));
  env = testEnv(DB, MEDIA);
  cookie = await adminCookie(db, now);
  await seed(db, [
    event({ slug: "lleno", title: "Con inscritos", capacity: 1 }),
    event({ slug: "vacio", title: "Sin inscritos" }),
    event({ slug: "estrella", title: "Destacado", featured: true }),
  ]);
});

afterAll(() => mf.dispose());

const get = (path: string, headers: Record<string, string> = { cookie }) =>
  app.request(path, { headers }, env);

const post = (
  path: string,
  body: FormData,
  headers: Record<string, string> = { cookie, origin: ORIGIN },
) => app.request(path, { method: "POST", body, headers }, env);

/** Opens a page as the signed-in admin, or with `headers`. */
const open = async (path: string, headers?: Record<string, string>) =>
  page(await get(path, headers));

/** Opens a page as a visitor. */
const visit = (path: string) => open(path, {});

/** The editor's fields for a valid event; `overrides` replaces fields. */
function eventForm(overrides: Record<string, string | File> = {}) {
  const data = new FormData();
  const fields: Record<string, string | File> = {
    title: "Taller de Qiskit",
    slug: "taller-qiskit",
    summary: "Tu primer circuito cuántico.",
    body: "Trae tu laptop.",
    start: "2027-01-16T10:00",
    end: "2027-01-16T13:00",
    place_kind: "venue",
    place_name: "FCF, UNMSM",
    place_address: "Av. Venezuela s/n",
    capacity: "30",
    questions: "Carrera*\nNivel: Básico | Avanzado",
    status: "published",
    kind: "workshop",
    accent: "#7C3AED",
    backdrop: "dots",
    font: "pixel",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const png = (name = "portada.png") =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
    type: "image/png",
  });

/** The message under a labelled field: its error, or its hint. */
const described = (p: Page, label: string) =>
  p.message(p.screen.getByLabelText(label));

/** A field's current value. */
const value = (p: Page, label: string) =>
  (p.screen.getByLabelText(label) as HTMLInputElement).value;

describe("access", () => {
  test("a visitor is sent to sign in, and a post without a session is refused", async () => {
    const res = await get("/admin", {});
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/sign-in?next=%2Fadmin");
    const refused = await post("/admin/events/new", eventForm(), {
      origin: ORIGIN,
    });
    expect(refused.status).toBe(403);
    expect(await findEvent(db, "taller-qiskit")).toBeNull();
  });

  test("a form post from another origin is refused", async () => {
    const res = await post("/admin/events/new", eventForm(), {
      cookie,
      origin: "https://evil.test",
    });
    expect(res.status).toBe(403);
    expect(await findEvent(db, "taller-qiskit")).toBeNull();
  });

  test("admin pages are not cached, and carry their own header", async () => {
    const p = await open("/admin");
    expect(p.status).toBe(200);
    expect(p.headers.get("cache-control")).toBe("no-store");
    expect(p.text(".admin-menu-name")).toBe("David");
    expect(p.screen.queryByRole("link", { name: "Instagram" })).toBeNull();
  });
});

describe("events", () => {
  test("creates a themed event with a cover", async () => {
    const res = await post(
      "/admin/events/new",
      eventForm({ cover: png(), featured: "on" }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "/admin/events/taller-qiskit?created",
    );
    const saved = await findEvent(db, "taller-qiskit");
    expect(saved).toMatchObject({
      start: "2027-01-16T10:00:00-05:00",
      capacity: 30,
      questions: [
        { id: "carrera", label: "Carrera", required: true },
        { id: "nivel", label: "Nivel", options: ["Básico", "Avanzado"] },
      ],
      theme: {
        kind: "workshop",
        accent: "#7c3aed",
        backdrop: "dots",
        font: "pixel",
      },
      featured: true,
    });
    expect(saved?.coverKey).toMatch(/^covers\/taller-qiskit-[\w-]{8}\.png$/);

    const media = await get(`/media/${saved?.coverKey}`, {});
    expect(media.status).toBe(200);
    expect(media.headers.get("content-type")).toBe("image/png");
    expect(media.headers.get("cache-control")).toContain("immutable");
  });

  test("featuring an event unfeatures the previous one", async () => {
    expect((await findEvent(db, "estrella"))?.featured).toBe(false);
    const home = await visit("/");
    expect(home.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Taller de Qiskit",
    );
  });

  test("a refused form keeps its values and names the fields", async () => {
    const res = await post(
      "/admin/events/new",
      eventForm({
        slug: "admin",
        end: "2027-01-16T09:00",
        accent: "azul",
        font: "comic",
      }),
    );
    const p = await page(res);
    expect(p.status).toBe(422);
    expect(described(p, "Enlace")).toStartWith("Esa dirección la usa el sitio");
    expect(described(p, "Fin")).toBe("El fin va después del inicio.");
    expect(described(p, "Color")).toBe("Un color como #2563eb.");
    const font = p.screen.getByRole("group", { name: "Letra del título" });
    expect(p.message(font)).toBe("Elige una letra.");
    expect(value(p, "Título")).toBe("Taller de Qiskit");
  });

  test("a taken slug is refused", async () => {
    const res = await post("/admin/events/new", eventForm({ slug: "vacio" }));
    const p = await page(res);
    expect(p.status).toBe(409);
    expect(described(p, "Enlace")).toBe("Ya hay un evento con esta dirección.");
  });

  test("renames an event without registrations and replaces its cover", async () => {
    const pedro = await signedIn(db, now, { name: "Pedro" });
    await addRole(db, "taller-qiskit", pedro.id, "speaker");
    const before = await findEvent(db, "taller-qiskit");
    const res = await post(
      "/admin/events/taller-qiskit/edit",
      eventForm({ slug: "qiskit", cover: png("nueva.png") }),
    );
    expect(res.status).toBe(303);
    expect(await findEvent(db, "taller-qiskit")).toBeNull();
    const after = await findEvent(db, "qiskit");
    expect(after?.coverKey).toMatch(/^covers\/qiskit-/);
    expect(await MEDIA.head(before?.coverKey ?? "")).toBeNull();
    expect(
      (await eventRoles(db, "qiskit")).map((p) => p.name),
      "the roles follow the new slug",
    ).toEqual(["Pedro"]);

    await post(
      "/admin/events/qiskit/edit",
      eventForm({ slug: "qiskit", remove_cover: "on" }),
    );
    expect((await findEvent(db, "qiskit"))?.coverKey).toBeUndefined();
    expect(await MEDIA.head(after?.coverKey ?? "")).toBeNull();
  });

  test("a point marked on the map puts the venue on a map", async () => {
    const res = await post(
      "/admin/events/vacio/edit",
      eventForm({ slug: "vacio", lat: "-12.0598607", lng: "-77.0817416" }),
    );
    expect(res.status).toBe(303);
    const saved = await findEvent(db, "vacio");
    expect(saved?.place).toMatchObject({
      point: { lat: -12.0598607, lng: -77.0817416 },
    });

    const editor = await open("/admin/events/vacio/edit");
    expect(value(editor, "Latitud")).toBe("-12.0598607");
    expect(value(editor, "Longitud")).toBe("-77.0817416");

    const p = await visit("/vacio");
    const map = p.document.querySelector<HTMLElement>(".venue-map");
    expect({ ...map?.dataset }).toEqual({
      lat: "-12.0598607",
      lng: "-77.0817416",
    });
    expect(
      p.screen
        .getByRole("link", { name: "Ver en el mapa" })
        .getAttribute("href"),
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query=-12.0598607,-77.0817416",
    );

    const refused = await page(
      await post(
        "/admin/events/vacio/edit",
        eventForm({ slug: "vacio", lat: "abc", lng: "-77" }),
      ),
    );
    expect(refused.status).toBe(422);
    expect(refused.document.querySelector("#a-lat-error")?.textContent).toBe(
      "Marca el lugar en el mapa otra vez.",
    );
  });

  test("the place search answers short queries empty and reports a failed search", async () => {
    const short = await get("/admin/places?q=fa");
    expect(await short.json()).toEqual({ places: [] });

    const coords = await get("/admin/places?q=-12.06,-77.08");
    expect(await coords.json()).toEqual({
      places: [
        {
          name: "-12.06,-77.08",
          address: "",
          point: { lat: -12.06, lng: -77.08 },
        },
      ],
    });

    const failed = await get("/admin/places?q=Facultad");
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({
      error: "La búsqueda no respondió.",
    });

    const visitor = await get("/admin/places?q=Facultad", {});
    expect(visitor.status).toBe(303);
  });

  test("an event with registrations keeps its slug and cannot be deleted", async () => {
    const reg = await app.request(
      "/lleno",
      { method: "POST", body: form({ email: "uno@example.com" }) },
      env,
    );
    expect(reg.status).toBe(303);
    await app.request(
      "/lleno",
      { method: "POST", body: form({ email: "dos@example.com" }) },
      env,
    );

    const res = await post(
      "/admin/events/lleno/edit",
      eventForm({ slug: "otro", title: "Con inscritos", capacity: "2" }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/events/lleno/edit?saved");

    // The raised capacity seats the waitlisted registrant at once.
    const seated = await DB.prepare(
      "SELECT COUNT(*) AS n FROM registrations WHERE event_slug = 'lleno' AND status = 'going'",
    ).first<{ n: number }>();
    expect(seated?.n).toBe(2);

    const removal = await page(
      await post("/admin/events/lleno/delete", new FormData()),
    );
    expect(removal.status).toBe(409);
    expect(removal.screen.getByRole("alert").textContent).toStartWith(
      "Tiene inscripciones",
    );
    expect(removal.button("Eliminar evento")).toBeNull();
    expect(await findEvent(db, "lleno")).not.toBeNull();
  });

  test("the overview counts seats, the waitlist and cancellations", async () => {
    const p = await open("/admin/events/lleno");
    expect(
      p.screen.getByRole("heading", { name: "Cuándo y dónde" }),
    ).toBeTruthy();
    expect(p.text(".stat")).toBe("2 / 2 con cupo");

    const more = await open("/admin/events/lleno/more");
    expect(more.status).toBe(200);
    expect(
      more.screen.getByRole("heading", { name: "Eliminar evento" }),
    ).toBeTruthy();
  });

  test("past events sit behind their own tab", async () => {
    const current = async (path: string) =>
      (await open(path)).screen
        .getByRole("navigation", { name: "Periodo" })
        .querySelector('[aria-current="page"]')
        ?.getAttribute("href");
    expect(await current("/admin")).toBe("/admin");
    expect(await current("/admin?period=past")).toBe("/admin?period=past");
  });

  test("deletes an event without registrations, and its roles", async () => {
    const ana = await signedIn(db, now, { name: "Ana" });
    await addRole(db, "vacio", ana.id, "mentor");
    const res = await post("/admin/events/vacio/delete", new FormData());
    expect(res.status).toBe(303);
    expect(await findEvent(db, "vacio")).toBeNull();
    expect(await eventRoles(db, "vacio")).toEqual([]);
  });
});

describe("team", () => {
  const team = "/admin/events/lleno/team";

  const person = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  /** The names under one role's heading on the Equipo tab. */
  const holders = (p: Page, role: string) =>
    [
      ...(p.screen
        .queryByRole("region", { name: role })
        ?.querySelectorAll(".team-member > span:first-child") ?? []),
    ].map((li) => li.firstChild?.textContent);

  /** Searches the Equipo tab and presses the first result's add button. */
  const pressFound = async (search: string, button: string) => {
    const found = await open(`${team}?${search}`);
    const [first] = found.screen.getAllByRole("button", { name: button });
    const form = first?.closest("form");
    if (!form) throw new Error(`no form for ${button}`);

    return post(
      form.getAttribute("action") ?? "",
      person(
        Object.fromEntries(
          [...form.querySelectorAll("input")].map((i) => [i.name, i.value]),
        ),
      ),
    );
  };

  const addFound = async (search: string, button: string) => {
    const res = await pressFound(search, button);
    expect(res.status, search).toBe(303);
    expect(res.headers.get("location")).toBe(team);
  };

  test("an admin finds accounts and gives roles; the event page shows them without emails", async () => {
    await signedIn(db, now, { name: "Ana Quispe", email: "ana@correo.com" });
    await signedIn(db, now, { name: "Luis" });

    const empty = await open(team);
    expect(empty.status).toBe(200);
    expect(empty.screen.getByText(/Nadie tiene un rol/)).toBeTruthy();

    await addFound("role=organizer&q=quispe", "Agregar como Organiza");
    await addFound("role=organizer&q=luis", "Agregar como Organiza");
    await addFound("role=judge&q=ANA%40correo", "Agregar como Jurado");

    const tab = await open(team);
    expect(holders(tab, "Organizan")).toEqual(["Ana Quispe", "Luis"]);
    expect(holders(tab, "Jurado")).toEqual(["Ana Quispe"]);
    expect(tab.screen.getAllByText(/ana@correo\.com/)).toHaveLength(2);

    const event = await visit("/lleno");
    const [organizers] = event.screen.getAllByRole("region", {
      name: "Organizan",
    });
    expect(organizers?.textContent).toContain("Ana Quispe");
    expect(organizers?.textContent).toContain("Luis");
    expect(event.document.documentElement.outerHTML).not.toContain(
      "ana@correo.com",
    );
  });

  test("the same person twice in one role is refused", async () => {
    const p = await page(
      await pressFound("role=organizer&q=quispe", "Agregar como Organiza"),
    );
    expect(p.status).toBe(422);
    expect(p.screen.getByRole("alert").textContent).toBe(
      "Esa persona ya tiene ese rol.",
    );
  });

  test("a search lists nobody until two letters, and a miss offers the sign-in link", async () => {
    const short = await open(`${team}?q=a`);
    expect(short.screen.queryByRole("list", { name: "Resultados" })).toBeNull();
    expect(value(short, "Buscar persona")).toBe("a");

    const miss = await open(`${team}?q=nadie`);
    expect(miss.screen.getByText(/Nadie con cuenta coincide/)).toBeTruthy();
    expect(miss.text(".copy-link code")).toBe(`${ORIGIN}/sign-in`);
  });

  test("an admin removes a role", async () => {
    const tab = await open(team);
    const quitar = tab.screen.getByRole("button", {
      name: "Quitar a Luis (Organiza)",
    });
    const action = quitar.closest("form")?.getAttribute("action") ?? "";
    const res = await post(action, new FormData());
    expect(res.status).toBe(303);
    expect(holders(await open(team), "Organizan")).toEqual(["Ana Quispe"]);
  });

  test("once the event is over, each role links its certificate", async () => {
    await seed(db, [
      event({
        slug: "cerrado",
        start: "2026-11-08T15:00:00-05:00",
        end: "2026-11-08T19:00:00-05:00",
      }),
    ]);
    const { id } = await signedIn(db, now, { name: "Vale" });
    await addRole(db, "cerrado", id, "volunteer");
    const [vale] = await eventRoles(db, "cerrado");

    const tab = await open("/admin/events/cerrado/team");
    const link = tab.screen.getByRole("link", {
      name: "Certificado de Vale (Voluntario)",
    });
    expect(link.getAttribute("href")).toBe(`/c/${vale?.certificateId}`);

    const upcoming = await open(team);
    expect(
      upcoming.screen.queryAllByRole("link", { name: /^Certificado de/ }),
    ).toEqual([]);
  });

  test("a visitor can neither see nor change the team", async () => {
    const res = await get(team, {});
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toStartWith("/sign-in?next=");

    const intruso = await signedIn(db, now, { name: "Intruso" });
    const refused = await post(
      team,
      person({ person: intruso.id, role: "organizer" }),
      { origin: ORIGIN },
    );
    expect(refused.status).not.toBe(303);
    expect((await eventRoles(db, "lleno")).map((p) => p.name)).not.toContain(
      "Intruso",
    );
  });
});

describe("registrants", () => {
  test("the CSV neutralizes formulas and keeps phones", async () => {
    await app.request(
      "/estrella",
      {
        method: "POST",
        body: form({ name: "=HYPERLINK(1)", email: "tres@example.com" }),
      },
      env,
    );
    const res = await get("/admin/events/estrella/registrants.csv");
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toContain(
      "estrella-inscritos.csv",
    );
    const csv = await res.text();
    expect(csv).toStartWith("numero,estado,nombre,correo,whatsapp");
    expect(csv).toContain(
      "1,going,'=HYPERLINK(1),tres@example.com,+51987654321",
    );
  });

  test("the list links each WhatsApp number and the door", async () => {
    const p = await open("/admin/events/estrella/registrants");
    expect(
      p.screen.getByRole("link", { name: "+51987654321" }).getAttribute("href"),
    ).toBe("https://wa.me/51987654321");
    expect(
      p.screen.getByRole("link", { name: "Puerta" }).getAttribute("href"),
    ).toBe("/door/estrella");
  });
});

/** A check-in form; `to` names the page to return to. */
const checkInForm = (to = "") => {
  const data = new FormData();
  if (to) data.set("next", to);
  return data;
};

describe("check-in", () => {
  beforeAll(() => seed(db, [event({ slug: "recepcion" })]));

  /** Registers `email` for the door's event and returns the ticket's token. */
  const register = async (email: string) => {
    const res = await app.request(
      "/recepcion",
      { method: "POST", body: form({ email }) },
      env,
    );
    return (res.headers.get("location") ?? "").match(
      /\/ticket\/([\w-]+)/,
    )?.[1] as string;
  };

  /** The door's verdict on the ticket: its seat, or what it lacks. */
  const door = (p: Page) => p.text(".door-who")?.split(" · ")[1];

  test("a visitor sees the QR; an admin sees the door", async () => {
    const token = await register("puerta@example.com");
    const visitor = await visit(`/ticket/${token}`);
    expect(visitor.document.querySelector(".ticket-qr svg")).not.toBeNull();
    expect(
      visitor.screen.getByText("Muestra este código en la entrada"),
    ).toBeTruthy();
    expect(visitor.button("Registrar ingreso")).toBeNull();

    const admin = await open(`/ticket/${token}`);
    expect(door(admin)).toBe("Tiene cupo");
    expect(admin.button("Registrar ingreso")?.closest("form")?.action).toBe(
      `https://up.test/door/recepcion/check-in/${token}`,
    );
  });

  test("a visitor cannot open the door or check a ticket in", async () => {
    const token = await register("intruso@example.com");
    expect((await get("/door/recepcion", {})).status).toBe(303);
    const refused = await post(
      `/door/recepcion/check-in/${token}`,
      checkInForm(),
      {
        origin: ORIGIN,
      },
    );
    expect(refused.status).toBe(404);
    const p = await visit(`/ticket/${token}`);
    expect(p.screen.queryByText(/^Ingresaste/)).toBeNull();
  });

  test("a check-in shows on the ticket and keeps the seat", async () => {
    const token = await register("llego@example.com");
    const res = await post(`/door/recepcion/check-in/${token}`, checkInForm());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/ticket/${token}`);

    const p = await visit(`/ticket/${token}`);
    expect(p.screen.getByText(/^Ingresaste a las 12:00 p\./)).toBeTruthy();
    expect(p.document.querySelector(".ticket-qr")).toBeNull();
    expect(p.button("Ya no puedo ir: cancelar mi inscripción")).toBeNull();

    // A late cancel does not erase the attendance.
    await post(`/ticket/${token}/cancel`, new FormData(), {});
    expect((await visit(`/ticket/${token}`)).text(".ticket-status")).toBe(
      "Tienes un cupo",
    );
  });

  test("the list checks a ticket in and counts it", async () => {
    const token = await register("lista@example.com");
    const res = await post(
      `/door/recepcion/check-in/${token}`,
      checkInForm("registrants"),
    );
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^\/admin\/events\/recepcion\/registrants#n\d+$/);

    const list = await open("/admin/events/recepcion/registrants");
    expect(list.text(".section-head p")).toMatch(/ · [1-9]\d* ingresaron$/);
    const row = list.document.getElementById(location.split("#")[1] ?? "");
    const cell = row?.querySelector('[data-label="Ingreso"]');
    expect(cell?.textContent).toStartWith("12:00 p.");

    await post(`/door/recepcion/check-in/${token}/undo`, checkInForm());
    const after = await open(`/ticket/${token}`);
    expect(after.button("Registrar ingreso")).not.toBeNull();
  });

  test("a cancelled ticket cannot check in", async () => {
    const token = await register("cancelo@example.com");
    await post(`/ticket/${token}/cancel`, new FormData(), {});
    await post(`/door/recepcion/check-in/${token}`, checkInForm());
    const p = await open(`/ticket/${token}`);
    expect(door(p)).toBe("Canceló su inscripción");
    expect(p.screen.queryByText(/^Ingresó a las/)).toBeNull();
    expect(p.button("Registrar ingreso")).toBeNull();
  });
});

describe("the door", () => {
  beforeAll(() =>
    seed(db, [
      event({ slug: "feria", title: "Feria", capacity: 1 }),
      event({ slug: "vecina", title: "Vecina" }),
      event({
        slug: "ayer",
        title: "Ayer",
        start: "2026-11-20T15:00:00-05:00",
        end: "2026-11-20T19:00:00-05:00",
      }),
    ]),
  );

  /** A ticket for `slug`, made the way the register form makes one. */
  const ticketAt = async (slug: string, email: string) => {
    const e = await findEvent(db, slug);
    if (!e) throw new Error(`no event ${slug}`);
    const r = await register(db, e, { ...person, email }, now.toISOString());
    return r.token;
  };
  const person = {
    name: "Rosa Díaz",
    email: "",
    phone: "+51987654321",
    newsOptIn: false,
    answers: {},
  };

  /** Signs in an account that volunteers at `slug` and returns its cookie. */
  const volunteer = async (slug: string) => {
    const vale = await signedIn(db, now, { name: "Vale" });
    await addRole(db, slug, vale.id, "volunteer");
    return vale.cookie;
  };

  test("a voluntario's account opens the door of that event only", async () => {
    const vale = await volunteer("feria");

    const door = await open("/door/feria", { cookie: vale });
    expect(door.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Feria",
    );
    expect((await get("/door/vecina", { cookie: vale })).status).toBe(404);

    const mine = await ticketAt("feria", "rosa@example.com");
    const scan = await open(`/ticket/${mine}`, { cookie: vale });
    expect(scan.button("Registrar ingreso")).not.toBeNull();
    const res = await post(
      `/door/feria/check-in/${mine}`,
      checkInForm("registrants"),
      {
        cookie: vale,
        origin: ORIGIN,
      },
    );
    expect(res.headers.get("location")).toBe(`/ticket/${mine}`);
    expect(
      (await visit(`/ticket/${mine}`)).screen.getByText(/^Ingresaste a las/),
    ).toBeTruthy();

    const other = await ticketAt("vecina", "rosa@example.com");
    const notHers = await open(`/ticket/${other}`, { cookie: vale });
    expect(notHers.button("Registrar ingreso")).toBeNull();
    const refused = await post(
      `/door/vecina/check-in/${other}`,
      checkInForm(),
      {
        cookie: vale,
        origin: ORIGIN,
      },
    );
    expect(refused.status).toBe(404);
    const crossed = await post(`/door/feria/check-in/${other}`, checkInForm(), {
      cookie: vale,
      origin: ORIGIN,
    });
    expect(crossed.status).toBe(404);
  });

  test("a signed-out visitor signs in first; an account without the role, or after removal, gets 404", async () => {
    const out = await get("/door/vecina", {});
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe("/sign-in?next=%2Fdoor%2Fvecina");

    const mentor = await signedIn(db, now, { name: "Mario" });
    await addRole(db, "vecina", mentor.id, "mentor");
    expect((await get("/door/vecina", { cookie: mentor.cookie })).status).toBe(
      404,
    );

    const vale = await volunteer("vecina");
    expect((await get("/door/vecina", { cookie: vale })).status).toBe(200);
    const role = (await eventRoles(db, "vecina")).find(
      (r) => r.name === "Vale",
    );
    await post(`/admin/events/vecina/team/${role?.id}/remove`, new FormData());
    expect((await get("/door/vecina", { cookie: vale })).status).toBe(404);
  });

  test("a voluntario's door closes when the event ends", async () => {
    const vale = await volunteer("ayer");
    expect((await get("/door/ayer", { cookie: vale })).status).toBe(404);

    const ended = await open("/door/ayer");
    expect(
      ended.screen.getByText("El evento terminó. La puerta está cerrada."),
    ).toBeTruthy();
    expect(ended.button("Registrar e ingresar")).toBeNull();
    expect((await post("/door/ayer/walk-in", form())).status).toBe(410);
  });

  test("a walk-in gets a seat past the capacity and is checked in", async () => {
    const missing = await page(
      await post("/door/feria/walk-in", form({ email: "" })),
    );
    expect(missing.status).toBe(422);
    expect(missing.screen.getByRole("alert").textContent).toBe(
      "Revisa los campos marcados.",
    );

    const walked = await page(
      await post(
        "/door/feria/walk-in",
        form({ name: "Lucho Paz", email: "lucho@example.com" }),
      ),
    );
    expect(walked.status).toBe(200);
    expect(walked.screen.getByRole("status").textContent).toMatch(
      /^#\d+ Lucho Paz ingresó\. Le enviamos su entrada por correo\.$/,
    );
    expect(walked.text(".door-who")).toMatch(/^\d+ ingresaron · 2 con cupo$/);

    const again = await page(
      await post(
        "/door/feria/walk-in",
        form({ name: "Lucho Paz", email: "lucho@example.com" }),
      ),
    );
    expect(again.screen.getByRole("status").textContent).toMatch(
      /^Lucho Paz ya estaba inscrito con la entrada #\d+\. Registramos su ingreso\.$/,
    );
    expect(again.text(".door-who")).toMatch(/ · 2 con cupo$/);
  });
});

describe("admins", () => {
  test("an admin adds a person with an account and removes them", async () => {
    const ines = await signedIn(db, now, {
      name: "Inés",
      email: "ines@example.com",
    });
    expect((await get("/admin", { cookie: ines.cookie })).status).toBe(404);

    const unknown = new FormData();
    unknown.set("email", "nadie@example.com");
    const refused = await page(await post("/admin/admins", unknown));
    expect(refused.status).toBe(422);
    expect(described(refused, "Hacer admin")).toMatch(/aún no tiene cuenta/);

    const known = new FormData();
    known.set("email", "INES@example.com");
    const added = await post("/admin/admins", known);
    expect(added.headers.get("location")).toBe(
      "/admin/settings?admins=added#admins-title",
    );
    expect((await get("/admin", { cookie: ines.cookie })).status).toBe(200);

    const removed = await post(
      `/admin/admins/${ines.id}/remove`,
      new FormData(),
    );
    expect(removed.status).toBe(303);
    expect((await get("/admin", { cookie: ines.cookie })).status).toBe(404);
  });

  test("an admin cannot remove themself", async () => {
    const own = await signedIn(db, now, { name: "Solo", admin: true });
    await post(`/admin/admins/${own.id}/remove`, new FormData(), {
      cookie: own.cookie,
      origin: ORIGIN,
    });
    const settings = await open("/admin/settings", { cookie: own.cookie });
    expect(settings.status).toBe(200);
    expect(settings.screen.getByText("Tú")).toBeTruthy();
  });

  test("a signed-in person who is not an admin cannot post", async () => {
    const plain = await signedIn(db, now, { name: "Pepe" });
    const res = await post("/admin/events/new", eventForm(), {
      cookie: plain.cookie,
      origin: ORIGIN,
    });
    expect(res.status).toBe(403);
  });
});
