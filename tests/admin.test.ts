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
import { createInvite } from "../src/worker/auth";
import { findEvent } from "../src/worker/events";
import { register } from "../src/worker/registrations";
import { addRole, eventRoles } from "../src/worker/roles";
import { softPasskey } from "./authenticator";
import { page, type Page } from "./dom";
import {
  adminCookie,
  event,
  form,
  HOST_TIMEOUT,
  migratedDb,
  ORIGIN,
  seed,
  testEnv,
} from "./support";

setDefaultTimeout(HOST_TIMEOUT);

const now = new Date("2026-12-01T12:00:00-05:00");
const app = createApp({ now: () => now });

let mf: Miniflare;
let DB: D1Database;
let MEDIA: R2Bucket;
let env: Env;
let cookie: string;

beforeAll(async () => {
  ({ mf, DB, MEDIA } = await migratedDb("admin"));
  env = testEnv(DB, MEDIA);
  cookie = await adminCookie(DB, now);
  await seed(DB, [
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

const postJson = (path: string, body: unknown) =>
  app.request(
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
    env,
  );

/** Starts a passkey ceremony and returns the challenge to answer. */
const begin = async (path: string, body: unknown) =>
  (await (await postJson(path, body)).json()) as {
    challengeId: string;
    options: { challenge: string };
  };

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
    kind: "taller",
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
    expect(res.headers.get("location")).toBe("/admin/entrar");
    const refused = await post("/admin/eventos/nuevo", eventForm(), {
      origin: ORIGIN,
    });
    expect(refused.status).toBe(403);
    expect(await findEvent(DB, "taller-qiskit")).toBeNull();
  });

  test("a form post from another origin is refused", async () => {
    const res = await post("/admin/eventos/nuevo", eventForm(), {
      cookie,
      origin: "https://evil.test",
    });
    expect(res.status).toBe(403);
    expect(await findEvent(DB, "taller-qiskit")).toBeNull();
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
      "/admin/eventos/nuevo",
      eventForm({ cover: png(), featured: "on" }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "/admin/eventos/taller-qiskit?creado",
    );
    const saved = await findEvent(DB, "taller-qiskit");
    expect(saved).toMatchObject({
      start: "2027-01-16T10:00:00-05:00",
      capacity: 30,
      questions: [
        { id: "carrera", label: "Carrera", required: true },
        { id: "nivel", label: "Nivel", options: ["Básico", "Avanzado"] },
      ],
      theme: {
        kind: "taller",
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
    expect((await findEvent(DB, "estrella"))?.featured).toBe(false);
    const home = await visit("/");
    expect(home.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Taller de Qiskit",
    );
  });

  test("a refused form keeps its values and names the fields", async () => {
    const res = await post(
      "/admin/eventos/nuevo",
      eventForm({
        slug: "admin",
        end: "2027-01-16T09:00",
        accent: "azul",
        font: "comic",
      }),
    );
    const p = await page(res);
    expect(p.status).toBe(422);
    expect(described(p, "Dirección")).toStartWith(
      "Esa dirección la usa el sitio",
    );
    expect(described(p, "Fin")).toBe("El fin va después del inicio.");
    expect(described(p, "Color")).toBe("Un color como #2563eb.");
    const font = p.screen.getByRole("group", { name: "Letra del título" });
    expect(p.message(font)).toBe("Elige una letra.");
    expect(value(p, "Título")).toBe("Taller de Qiskit");
  });

  test("a taken slug is refused", async () => {
    const res = await post(
      "/admin/eventos/nuevo",
      eventForm({ slug: "vacio" }),
    );
    const p = await page(res);
    expect(p.status).toBe(409);
    expect(described(p, "Dirección")).toBe(
      "Ya hay un evento con esta dirección.",
    );
  });

  test("renames an event without registrations and replaces its cover", async () => {
    await addRole(DB, "taller-qiskit", {
      name: "Pedro",
      email: null,
      role: "ponente",
    });
    const before = await findEvent(DB, "taller-qiskit");
    const res = await post(
      "/admin/eventos/taller-qiskit/editar",
      eventForm({ slug: "qiskit", cover: png("nueva.png") }),
    );
    expect(res.status).toBe(303);
    expect(await findEvent(DB, "taller-qiskit")).toBeNull();
    const after = await findEvent(DB, "qiskit");
    expect(after?.coverKey).toMatch(/^covers\/qiskit-/);
    expect(await MEDIA.head(before?.coverKey ?? "")).toBeNull();
    expect(
      (await eventRoles(DB, "qiskit")).map((p) => p.name),
      "the roles follow the new slug",
    ).toEqual(["Pedro"]);

    await post(
      "/admin/eventos/qiskit/editar",
      eventForm({ slug: "qiskit", remove_cover: "on" }),
    );
    expect((await findEvent(DB, "qiskit"))?.coverKey).toBeUndefined();
    expect(await MEDIA.head(after?.coverKey ?? "")).toBeNull();
  });

  test("coordinates in the map field put the venue on a map", async () => {
    const res = await post(
      "/admin/eventos/vacio/editar",
      eventForm({ slug: "vacio", map_url: "-12.0598607, -77.0817416" }),
    );
    expect(res.status).toBe(303);
    const saved = await findEvent(DB, "vacio");
    expect(saved?.place).toMatchObject({
      point: { lat: -12.0598607, lng: -77.0817416 },
    });

    const editor = await open("/admin/eventos/vacio/editar");
    expect(value(editor, "Mapa")).toBe("-12.0598607, -77.0817416");

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
        "/admin/eventos/vacio/editar",
        eventForm({ slug: "vacio", map_url: "cerca del parque" }),
      ),
    );
    expect(refused.status).toBe(422);
    expect(described(refused, "Mapa")).toStartWith(
      "Pega un enlace de Google Maps",
    );
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
      "/admin/eventos/lleno/editar",
      eventForm({ slug: "otro", title: "Con inscritos", capacity: "2" }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "/admin/eventos/lleno/editar?guardado",
    );

    // The raised capacity seats the waitlisted registrant at once.
    const seated = await DB.prepare(
      "SELECT COUNT(*) AS n FROM registrations WHERE event_slug = 'lleno' AND status = 'going'",
    ).first<{ n: number }>();
    expect(seated?.n).toBe(2);

    const removal = await page(
      await post("/admin/eventos/lleno/eliminar", new FormData()),
    );
    expect(removal.status).toBe(409);
    expect(removal.screen.getByRole("alert").textContent).toStartWith(
      "Tiene inscripciones",
    );
    expect(removal.button("Eliminar evento")).toBeNull();
    expect(await findEvent(DB, "lleno")).not.toBeNull();
  });

  test("the overview counts seats, the waitlist and cancellations", async () => {
    const p = await open("/admin/eventos/lleno");
    expect(
      p.screen.getByRole("heading", { name: "Cuándo y dónde" }),
    ).toBeTruthy();
    expect(p.text(".stat")).toBe("2 / 2 con cupo");

    const more = await open("/admin/eventos/lleno/mas");
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
    expect(await current("/admin?periodo=pasados")).toBe(
      "/admin?periodo=pasados",
    );
  });

  test("deletes an event without registrations, and its roles", async () => {
    await addRole(DB, "vacio", { name: "Ana", email: null, role: "mentor" });
    const res = await post("/admin/eventos/vacio/eliminar", new FormData());
    expect(res.status).toBe(303);
    expect(await findEvent(DB, "vacio")).toBeNull();
    expect(await eventRoles(DB, "vacio")).toEqual([]);
  });
});

describe("team", () => {
  const team = "/admin/eventos/lleno/equipo";

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

  test("an admin gives roles; the event page shows them without emails", async () => {
    const empty = await open(team);
    expect(empty.status).toBe(200);
    expect(empty.screen.getByText(/Nadie tiene un rol/)).toBeTruthy();

    for (const fields of [
      { name: "Ana Quispe", email: "Ana@Correo.com", role: "organiza" },
      { name: "Luis", email: "", role: "organiza" },
      { name: "Ana Quispe", email: "ana@correo.com", role: "jurado" },
    ]) {
      const res = await post(team, person(fields));
      expect(res.status, fields.role).toBe(303);
      expect(res.headers.get("location")).toBe(team);
    }

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
      await post(
        team,
        person({ name: "Ana", email: "ana@correo.com", role: "organiza" }),
      ),
    );
    expect(p.status).toBe(422);
    expect(described(p, "Correo")).toBe("Esa persona ya tiene ese rol.");
    expect(value(p, "Nombre")).toBe("Ana");
  });

  test("a short name, a broken email and no role are refused", async () => {
    const p = await page(
      await post(team, person({ name: "A", email: "ana@" })),
    );
    expect(p.status).toBe(422);
    expect(described(p, "Nombre")).toBe("Escribe el nombre.");
    expect(described(p, "Correo")).toBe(
      "Escribe un correo válido o déjalo vacío.",
    );
    expect(p.screen.getByRole("alert").textContent).toContain("Revisa");
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

  test("once the event is over, each role links its certificate and the door link goes", async () => {
    await seed(DB, [
      event({
        slug: "cerrado",
        start: "2026-11-08T15:00:00-05:00",
        end: "2026-11-08T19:00:00-05:00",
      }),
    ]);
    await addRole(DB, "cerrado", {
      name: "Vale",
      email: null,
      role: "voluntario",
    });
    const [vale] = await eventRoles(DB, "cerrado");

    const tab = await open("/admin/eventos/cerrado/equipo");
    const link = tab.screen.getByRole("link", {
      name: "Certificado de Vale (Voluntario)",
    });
    expect(link.getAttribute("href")).toBe(`/c/${vale?.certificateId}`);
    expect(
      tab.screen.queryByRole("button", { name: /enlace de puerta/i }),
    ).toBeNull();

    const upcoming = await open(team);
    expect(
      upcoming.screen.queryAllByRole("link", { name: /^Certificado de/ }),
    ).toEqual([]);
  });

  test("a visitor can neither see nor change the team", async () => {
    const res = await get(team, {});
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/entrar");

    const refused = await post(
      team,
      person({ name: "Intruso", role: "organiza" }),
      { origin: ORIGIN },
    );
    expect(refused.status).not.toBe(303);
    expect((await eventRoles(DB, "lleno")).map((p) => p.name)).not.toContain(
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
    const res = await get("/admin/eventos/estrella/inscritos.csv");
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
    const p = await open("/admin/eventos/estrella/inscritos");
    expect(
      p.screen.getByRole("link", { name: "+51987654321" }).getAttribute("href"),
    ).toBe("https://wa.me/51987654321");
    expect(
      p.screen.getByRole("link", { name: "Puerta" }).getAttribute("href"),
    ).toBe("/puerta/estrella");
  });
});

/** A check-in form; `to` names the page to return to. */
const volver = (to = "") => {
  const data = new FormData();
  if (to) data.set("volver", to);
  return data;
};

describe("check-in", () => {
  beforeAll(() => seed(DB, [event({ slug: "recepcion" })]));

  /** Registers `email` for the door's event and returns the ticket's token. */
  const register = async (email: string) => {
    const res = await app.request(
      "/recepcion",
      { method: "POST", body: form({ email }) },
      env,
    );
    return (res.headers.get("location") ?? "").match(
      /\/entrada\/([\w-]+)/,
    )?.[1] as string;
  };

  /** The door's verdict on the ticket: its seat, or what it lacks. */
  const door = (p: Page) => p.text(".door-who")?.split(" · ")[1];

  test("a visitor sees the QR; an admin sees the door", async () => {
    const token = await register("puerta@example.com");
    const visitor = await visit(`/entrada/${token}`);
    expect(visitor.document.querySelector(".ticket-qr svg")).not.toBeNull();
    expect(
      visitor.screen.getByText("Muestra este código en la entrada"),
    ).toBeTruthy();
    expect(visitor.button("Registrar ingreso")).toBeNull();

    const admin = await open(`/entrada/${token}`);
    expect(door(admin)).toBe("Tiene cupo");
    expect(admin.button("Registrar ingreso")?.closest("form")?.action).toBe(
      `https://up.test/puerta/recepcion/ingreso/${token}`,
    );
  });

  test("a visitor cannot open the door or check a ticket in", async () => {
    const token = await register("intruso@example.com");
    expect((await get("/puerta/recepcion", {})).status).toBe(404);
    const refused = await post(`/puerta/recepcion/ingreso/${token}`, volver(), {
      origin: ORIGIN,
    });
    expect(refused.status).toBe(404);
    const p = await visit(`/entrada/${token}`);
    expect(p.screen.queryByText(/^Ingresaste/)).toBeNull();
  });

  test("a check-in shows on the ticket and keeps the seat", async () => {
    const token = await register("llego@example.com");
    const res = await post(`/puerta/recepcion/ingreso/${token}`, volver());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/entrada/${token}`);

    const p = await visit(`/entrada/${token}`);
    expect(p.screen.getByText(/^Ingresaste a las 12:00 p\./)).toBeTruthy();
    expect(p.document.querySelector(".ticket-qr")).toBeNull();
    expect(p.button("Ya no puedo ir: cancelar mi inscripción")).toBeNull();

    // A late cancel does not erase the attendance.
    await post(`/entrada/${token}/cancelar`, new FormData(), {});
    expect((await visit(`/entrada/${token}`)).text(".ticket-status")).toBe(
      "Tienes un cupo",
    );
  });

  test("the list checks a ticket in and counts it", async () => {
    const token = await register("lista@example.com");
    const res = await post(
      `/puerta/recepcion/ingreso/${token}`,
      volver("inscritos"),
    );
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^\/admin\/eventos\/recepcion\/inscritos#n\d+$/);

    const list = await open("/admin/eventos/recepcion/inscritos");
    expect(list.text(".section-head p")).toMatch(/ · [1-9]\d* ingresaron$/);
    const row = list.document.getElementById(location.split("#")[1] ?? "");
    const cell = row?.querySelector('[data-label="Ingreso"]');
    expect(cell?.textContent).toStartWith("12:00 p.");

    await post(`/puerta/recepcion/ingreso/${token}/deshacer`, volver());
    const after = await open(`/entrada/${token}`);
    expect(after.button("Registrar ingreso")).not.toBeNull();
  });

  test("a cancelled ticket cannot check in", async () => {
    const token = await register("cancelo@example.com");
    await post(`/entrada/${token}/cancelar`, new FormData(), {});
    await post(`/puerta/recepcion/ingreso/${token}`, volver());
    const p = await open(`/entrada/${token}`);
    expect(door(p)).toBe("Canceló su inscripción");
    expect(p.screen.queryByText(/^Ingresó a las/)).toBeNull();
    expect(p.button("Registrar ingreso")).toBeNull();
  });
});

describe("the door", () => {
  beforeAll(() =>
    seed(DB, [
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
    const e = await findEvent(DB, slug);
    if (!e) throw new Error(`no event ${slug}`);
    const r = await register(DB, e, { ...person, email }, now.toISOString());
    return r.token;
  };
  const person = {
    name: "Rosa Díaz",
    email: "",
    phone: "+51987654321",
    newsOptIn: false,
    answers: {},
  };

  /** Gives Vale the voluntario role at `slug` and returns her door link. */
  const doorLink = async (slug: string) => {
    await addRole(DB, slug, { name: "Vale", email: null, role: "voluntario" });
    const vale = (await eventRoles(DB, slug)).find((p) => p.name === "Vale");
    const team = await page(
      await post(
        `/admin/eventos/${slug}/equipo/${vale?.id}/puerta`,
        new FormData(),
      ),
    );
    expect(team.screen.getByRole("status").textContent).toContain(
      "Envía este enlace a Vale",
    );
    return team.text(".invite-url code") ?? "";
  };

  /** Opens a door link and returns the cookie it sets. */
  const openLink = async (url: string) => {
    const res = await get(new URL(url).pathname, {});
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/puerta\/[\w-]+$/);
    return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  };

  test("a voluntario's link opens the door of that event only", async () => {
    const url = await doorLink("feria");
    expect(url).toMatch(/^https:\/\/up\.test\/puerta\/abrir\/[\w-]+$/);
    const vale = await openLink(url);

    const door = await open("/puerta/feria", { cookie: vale });
    expect(door.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Feria",
    );
    expect(door.button("Salir de la puerta")).not.toBeNull();
    expect((await get("/puerta/vecina", { cookie: vale })).status).toBe(404);

    const mine = await ticketAt("feria", "rosa@example.com");
    const scan = await open(`/entrada/${mine}`, { cookie: vale });
    expect(scan.button("Registrar ingreso")).not.toBeNull();
    const res = await post(
      `/puerta/feria/ingreso/${mine}`,
      volver("inscritos"),
      {
        cookie: vale,
        origin: ORIGIN,
      },
    );
    expect(res.headers.get("location")).toBe(`/entrada/${mine}`);
    expect(
      (await visit(`/entrada/${mine}`)).screen.getByText(/^Ingresaste a las/),
    ).toBeTruthy();

    const other = await ticketAt("vecina", "rosa@example.com");
    const notHers = await open(`/entrada/${other}`, { cookie: vale });
    expect(notHers.button("Registrar ingreso")).toBeNull();
    const refused = await post(`/puerta/vecina/ingreso/${other}`, volver(), {
      cookie: vale,
      origin: ORIGIN,
    });
    expect(refused.status).toBe(404);
    const crossed = await post(`/puerta/feria/ingreso/${other}`, volver(), {
      cookie: vale,
      origin: ORIGIN,
    });
    expect(crossed.status).toBe(404);
  });

  test("a new link revokes the old one, and leaving the door drops the cookie", async () => {
    const old = await openLink(await doorLink("vecina"));
    const fresh = await openLink(await doorLink("vecina"));
    expect((await get("/puerta/vecina", { cookie: old })).status).toBe(404);
    expect((await get("/puerta/vecina", { cookie: fresh })).status).toBe(200);

    const out = await post("/puerta/salir", new FormData(), {
      cookie: fresh,
      origin: ORIGIN,
    });
    expect(out.headers.get("location")).toBe("/");
    expect(out.headers.get("set-cookie")).toMatch(/^up_door=;.*Max-Age=0/);
  });

  test("a voluntario's door closes when the event ends", async () => {
    const vale = await openLink(await doorLink("ayer"));
    expect((await get("/puerta/ayer", { cookie: vale })).status).toBe(404);

    const ended = await open("/puerta/ayer");
    expect(
      ended.screen.getByText("El evento terminó. La puerta está cerrada."),
    ).toBeTruthy();
    expect(ended.button("Registrar e ingresar")).toBeNull();
    expect((await post("/puerta/ayer/llegada", form())).status).toBe(410);
  });

  test("a walk-in gets a seat past the capacity and is checked in", async () => {
    const before = await open("/puerta/feria");
    expect(before.button("Salir de la puerta")).toBeNull();

    const missing = await page(
      await post("/puerta/feria/llegada", form({ email: "" })),
    );
    expect(missing.status).toBe(422);
    expect(missing.screen.getByRole("alert").textContent).toBe(
      "Revisa los campos marcados.",
    );

    const walked = await page(
      await post(
        "/puerta/feria/llegada",
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
        "/puerta/feria/llegada",
        form({ name: "Lucho Paz", email: "lucho@example.com" }),
      ),
    );
    expect(again.screen.getByRole("status").textContent).toMatch(
      /^Lucho Paz ya estaba inscrito con la entrada #\d+\. Registramos su ingreso\.$/,
    );
    expect(again.text(".door-who")).toMatch(/ · 2 con cupo$/);
  });
});

describe("passkeys", () => {
  test("an invite makes an admin who then signs in", async () => {
    const unnamed = await post("/admin/invitaciones", new FormData());
    expect(unnamed.status).toBe(422);
    const invited = new FormData();
    invited.set("name", "Pedro");
    const settings = await page(await post("/admin/invitaciones", invited));
    const url = settings.text(".invite-url code") ?? "";
    expect(url).toMatch(/^https:\/\/up\.test\/admin\/invitacion\/[\w-]+$/);
    const token = url.split("/").pop() ?? "";
    const welcome = await visit(`/admin/invitacion/${token}`);
    expect(welcome.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Hola, Pedro",
    );

    const key = await softPasskey(ORIGIN);
    const start = await begin("/admin/passkey/registro/opciones", {
      invite: token,
    });
    const created = await postJson("/admin/passkey/registro", {
      invite: token,
      challengeId: start.challengeId,
      response: await key.create(start.options.challenge),
    });
    expect(await created.json()).toEqual({ redirect: "/admin" });
    expect(created.headers.get("set-cookie")).toContain("up_admin=");
    expect(created.headers.get("set-cookie")).toContain("HttpOnly");

    // The invite is spent.
    const again = await postJson("/admin/passkey/registro/opciones", {
      invite: token,
    });
    expect(again.status).toBe(410);
    expect((await get(`/admin/invitacion/${token}`, {})).status).toBe(404);

    const signIn = await begin("/admin/passkey/entrar/opciones", {});
    const signedIn = await postJson("/admin/passkey/entrar", {
      challengeId: signIn.challengeId,
      response: await key.get(signIn.options.challenge),
    });
    expect(await signedIn.json()).toEqual({ redirect: "/admin" });
    const session = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];
    const admin = await open("/admin", { cookie: session ?? "" });
    expect(admin.text(".admin-menu-name")).toBe("Pedro");

    // A challenge answers once.
    const replay = await postJson("/admin/passkey/entrar", {
      challengeId: signIn.challengeId,
      response: await key.get(signIn.options.challenge),
    });
    expect(replay.status).toBe(401);
  });

  test("an unknown passkey is refused", async () => {
    const key = await softPasskey(ORIGIN);
    const start = await begin("/admin/passkey/entrar/opciones", {});
    const res = await postJson("/admin/passkey/entrar", {
      challengeId: start.challengeId,
      response: await key.get(start.options.challenge),
    });
    expect(res.status).toBe(401);
  });

  test("an expired invite shows the gone page", async () => {
    const token = await createInvite(DB, "Tarde", "2026-11-01T00:00:00.000Z");
    expect((await get(`/admin/invitacion/${token}`, {})).status).toBe(404);
  });

  test("signing out ends the session", async () => {
    const own = await adminCookie(DB, now, "Sale");
    const res = await post("/admin/salir", new FormData(), {
      cookie: own,
      origin: ORIGIN,
    });
    expect(res.status).toBe(303);
    expect((await get("/admin", { cookie: own })).status).toBe(303);
  });
});
