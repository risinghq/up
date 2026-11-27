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
import type { Fetch } from "../src/worker/web";
import { checkIn } from "../src/worker/registrations";
import { sendReminders } from "../src/worker/reminders";
import { addRole, eventRoles } from "../src/worker/roles";
import { page, parse, type Page } from "./dom";
import {
  adminCookie,
  cardAssets,
  event,
  form,
  HOST_TIMEOUT,
  migratedDb,
  newPerson,
  outbox,
  seed,
  testEnv,
} from "./support";

setDefaultTimeout(HOST_TIMEOUT);

// Every event below is judged against this moment.
const now = new Date("2026-12-01T12:00:00-05:00");

const events = [
  event({
    slug: "taller",
    title: "Taller de Rust",
    capacity: 1,
    questions: [
      { id: "carrera", label: "Carrera", required: true },
      { id: "nivel", label: "Nivel", options: ["Básico", "Avanzado"] },
    ],
  }),
  event({ slug: "charla", title: "Charla abierta" }),
  event({
    slug: "pasado",
    title: "Evento pasado",
    start: "2026-11-01T15:00:00-05:00",
    end: "2026-11-01T19:00:00-05:00",
    recordingUrl: "https://youtu.be/test",
  }),
  event({ slug: "borrador", title: "Evento en borrador", status: "draft" }),
  event({
    slug: "organizado",
    title: "Meetup organizado",
    start: "2026-11-08T15:00:00-05:00",
    end: "2026-11-08T19:00:00-05:00",
  }),
];

const app = createApp({ now: () => now, card: cardAssets() });

let mf: Miniflare;
let DB: D1Database;
let db: Db;
let env: Env;
const mail = outbox();

beforeAll(async () => {
  let MEDIA: R2Bucket;
  ({ mf, DB, db, MEDIA } = await migratedDb("app"));
  env = testEnv(DB, MEDIA, { EMAIL: mail.binding });
  await seed(db, events);
  const ana = await newPerson(db, {
    name: "Ana Quispe",
    email: "ana@example.com",
  });
  await addRole(db, "organizado", ana, "organizer");
  await addRole(
    db,
    "organizado",
    await newPerson(db, { name: "Pedro" }),
    "speaker",
  );
});

afterAll(() => mf.dispose());

/** No WhatsApp phone number id is set here, so nothing may reach the network. */
const noFetch: Fetch = async () => {
  throw new Error("unexpected fetch");
};

const get = (path: string, headers: Record<string, string> = {}) =>
  app.request(path, { headers }, env);

const post = (path: string, body: FormData) =>
  app.request(path, { method: "POST", body }, env);

const open = async (path: string, headers: Record<string, string> = {}) =>
  page(await get(path, headers));

/** Registers and returns the ticket token from the redirect. */
async function registerAs(slug: string, fields: Record<string, string>) {
  const res = await post(`/${slug}`, form(fields));
  expect(res.status).toBe(303);
  const location = res.headers.get("location") ?? "";
  expect(location).toMatch(/^\/ticket\/[\w-]{22}\?new$/);
  return location.slice("/ticket/".length, -"?new".length);
}

/** The event titles a listing shows. */
const listed = (p: Page) =>
  p.screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);

/** The headings of a page's cards, in reading order. */
const cards = (p: Page) =>
  p.screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent);

/** The message a labelled field's description carries. */
const described = (p: Page, label: string) =>
  p.message(p.screen.getByLabelText(label));

const button = (p: Page, name: string) => p.button(name);

const counts = (p: Page) => p.text(".profile-count");

describe("home", () => {
  test("lists upcoming events and hides drafts", async () => {
    expect(listed(await open("/"))).toEqual([
      "Taller de Rust",
      "Charla abierta",
    ]);
  });

  test("preloads the Geist file the stylesheet uses", async () => {
    const font = (await open("/")).document.querySelector(
      'link[rel="preload"][as="font"]',
    );
    expect(font?.getAttribute("href")).toBe(
      "/assets/geist-latin-wght-normal-test.woff2",
    );
    expect(font?.getAttribute("crossorigin")).toBe("anonymous");
  });

  test("sets the scheme before paint, with a theme-color for each", async () => {
    const p = await open("/");
    const head = [...p.document.head.children];
    const scheme = head.findIndex((el) =>
      el.textContent?.includes('classList.toggle("dark"'),
    );
    const styles = head.findIndex(
      (el) => el.getAttribute("rel") === "stylesheet",
    );
    expect(scheme).toBeGreaterThan(-1);
    expect(scheme).toBeLessThan(styles);

    const colors = [
      ...p.document.querySelectorAll('meta[name="theme-color"]'),
    ].map((m) => [m.getAttribute("data-scheme"), m.getAttribute("content")]);
    expect(colors).toEqual([
      ["light", "#f2f2f2"],
      ["dark", "#141414"],
    ]);
    expect(button(p, "Modo oscuro")).not.toBeNull();
  });

  test("the past tab lists ended events", async () => {
    expect(listed(await open("/?period=past"))).toEqual([
      "Meetup organizado",
      "Evento pasado",
    ]);
  });

  test("a draft is served only to a signed-in admin", async () => {
    expect((await get("/borrador")).status).toBe(404);

    const cookie = await adminCookie(db, now);
    const draft = await open("/borrador", { cookie });
    expect(draft.status).toBe(200);
    expect(draft.headers.get("cache-control")).toBe("no-store");
    expect(draft.meta("robots")).toBe("noindex");
    expect(listed(await open("/", { cookie }))).toContain("Evento en borrador");
  });
});

describe("event page", () => {
  test("carries the link preview tags", async () => {
    const p = await open("/charla");
    expect(p.meta("og:title")).toBe("Charla abierta");
    expect(p.link("canonical")).toBe("https://up.test/charla");
  });

  test("an ended event shows the recording and refuses registrations", async () => {
    const p = await open("/pasado");
    expect(
      p.screen.getByRole("link", { name: "Ver la grabación" }),
    ).toHaveProperty("href", "https://youtu.be/test");
    expect(button(p, "Inscribirme")).toBeNull();

    const res = await post("/pasado", form({ email: "late@example.com" }));
    expect(res.status).toBe(410);
  });

  test("keeps its nav in place, where the home nav sticks", async () => {
    const sticks = async (path: string) =>
      (await open(path)).document
        .querySelector("header.site-nav")
        ?.classList.contains("sticky");
    expect(await sticks("/")).toBe(true);
    expect(await sticks("/charla")).toBe(false);
  });

  test("a tinted event marks its page for the dark palette", async () => {
    const p = await open("/charla");
    expect(p.document.body.classList.contains("tinted")).toBe(true);
    const dark = p.document.querySelector(
      'meta[name="theme-color"][data-scheme="dark"]',
    );
    expect(dark?.getAttribute("content")).not.toBe("#141414");
  });

  test("shows the kind only when the title does not name it", async () => {
    const kind = async (path: string) =>
      (await open(path)).document.querySelector(".category")?.textContent ??
      null;
    expect(await kind("/taller")).toBeNull();
    expect(await kind("/charla")).toBe("Taller");
  });

  test("an unknown slug is a 404 page", async () => {
    const p = await open("/no-existe");
    expect(p.status).toBe(404);
    expect(p.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "No encontramos esta página",
    );
  });
});

describe("registration", () => {
  test("registers, stores E.164 and consent, and opens the ticket", async () => {
    const token = await registerAs("charla", {
      email: "Luis@Example.com",
      name: "Luis Quispe",
      phone: "912-345-678",
      news: "on",
    });
    const person = await DB.prepare(
      "SELECT email, phone, privacy_accepted_at, news_opt_in_at FROM people WHERE email = ?",
    )
      .bind("luis@example.com")
      .first();
    expect(person).toEqual({
      email: "luis@example.com",
      phone: "+51912345678",
      privacy_accepted_at: now.toISOString(),
      news_opt_in_at: now.toISOString(),
    });

    const p = await open(`/ticket/${token}?new`);
    expect(p.headers.get("cache-control")).toBe("no-store");
    expect(p.screen.getByText(/^¡Listo, Luis!/)).toBeTruthy();
    expect(p.screen.getByText("Tienes un cupo")).toBeTruthy();
    expect(p.screen.getByText("#1")).toBeTruthy();
  });

  test("a refused form comes back with its values and messages", async () => {
    const res = await post(
      "/taller",
      form({
        name: "Eva",
        email: "eva@",
        phone: "123",
        privacy: "",
        q_nivel: "Experto",
      }),
    );
    const p = await page(res);
    expect(p.status).toBe(422);
    expect(p.screen.getByLabelText("Nombre y apellido")).toHaveProperty(
      "value",
      "Eva",
    );
    expect(described(p, "Correo")).toBe("Escribe un correo válido.");
    expect(described(p, "WhatsApp")).toStartWith(
      "Escribe un número de WhatsApp",
    );
    expect(described(p, "Carrera")).toBe("Responde esta pregunta.");
    expect(described(p, "Nivel")).toBe("Elige una de las opciones.");
    const privacy = p.document.getElementById("f-privacy-error");
    expect(privacy?.textContent).toStartWith("Necesitamos tu aceptación");

    // The page reloads at the top; focus takes it to the first error.
    const focused = [...p.document.querySelectorAll("[autofocus]")];
    expect(focused).toEqual([p.screen.getByLabelText("Correo")]);
  });

  test("a registration emails the ticket link", async () => {
    const token = await registerAs("charla", { email: "mail@example.com" });
    const [message] = mail.sent.filter((m) => m.to === "mail@example.com");
    expect(message?.subject).toBe("Estás inscrito: Charla abierta");
    expect(message?.text).toContain(`https://up.test/ticket/${token}`);
    expect(message?.text).toContain("Hola, Ana:");
    const links = [
      ...parse(message?.html ?? "").document.querySelectorAll("a"),
    ];
    expect(links.map((a) => a.getAttribute("href"))).toContain(
      `https://up.test/ticket/${token}`,
    );
  });

  test("an email already registered gets its link by email, not on the page", async () => {
    const token = await registerAs("charla", { email: "twice@example.com" });
    const res = await post("/charla", form({ email: "twice@example.com" }));
    expect(res.headers.get("location")).toBeNull();
    const p = await page(res);
    expect(p.status).toBe(409);
    const notice = p.screen.getByText(/^Este correo ya está inscrito/);
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.hasAttribute("autofocus")).toBe(true);
    expect(
      p.document.querySelector('[href*="/ticket/"], [action*="/ticket/"]'),
    ).toBeNull();

    // A third post inside the cooldown sends nothing more.
    await post("/charla", form({ email: "twice@example.com" }));
    expect(mail.subjects("twice@example.com")).toEqual([
      "Estás inscrito: Charla abierta",
      "Tu entrada: Charla abierta",
    ]);
    const resent = mail.sent.filter((m) => m.to === "twice@example.com")[1];
    expect(resent?.text).toContain(`/ticket/${token}`);
  });

  test("a title with markup reaches the email as text", async () => {
    await seed(db, [event({ slug: "marcado", title: "<b>Taller</b> & más" })]);
    await registerAs("marcado", { email: "marcado@example.com" });
    const message = mail.sent.find((m) => m.to === "marcado@example.com");
    const email = parse(message?.html ?? "");
    expect(email.document.querySelector("b")).toBeNull();
    expect(email.document.body.textContent).toContain("<b>Taller</b> & más");
  });

  test("a filled trap field stores nothing", async () => {
    const res = await post(
      "/charla",
      form({ email: "bot@example.com", website: "x" }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/charla");
    const row = await DB.prepare("SELECT id FROM people WHERE email = ?")
      .bind("bot@example.com")
      .first();
    expect(row).toBeNull();
  });
});

/** What the ticket page says about the seat. */
const seat = async (token: string) =>
  (await open(`/ticket/${token}`)).document
    .querySelector(".ticket-status")
    ?.textContent?.trim();

describe("capacity and cancellation", () => {
  test("a full event waitlists, and a cancellation promotes the waitlist", async () => {
    const first = await registerAs("taller", {
      email: "uno@example.com",
      q_carrera: "Física",
    });
    const second = await registerAs("taller", {
      email: "dos@example.com",
      q_carrera: "Física",
    });

    expect(await seat(second)).toBe("Estás en la lista de espera");
    expect(
      button(await open("/taller"), "Unirme a la lista de espera"),
    ).not.toBeNull();

    const cancelled = await post(`/ticket/${first}/cancel`, new FormData());
    expect(cancelled.status).toBe(303);
    expect(await seat(first)).toBe("Cancelaste tu inscripción");
    expect(await seat(second)).toBe("Tienes un cupo");
    expect(mail.subjects("dos@example.com")).toEqual([
      "Estás en la lista de espera: Taller de Rust",
      "Tienes cupo: Taller de Rust",
    ]);
  });

  test("registering again after cancelling issues a new ticket", async () => {
    const old = await registerAs("charla", { email: "vuelve@example.com" });
    await post(`/ticket/${old}/cancel`, new FormData());
    const fresh = await registerAs("charla", { email: "vuelve@example.com" });
    expect(fresh).not.toBe(old);
    expect((await get(`/ticket/${old}`)).status).toBe(404);
    expect(await seat(fresh)).toBe("Tienes un cupo");
  });

  test("an unknown ticket is a 404", async () => {
    const p = await open("/ticket/AAAAAAAAAAAAAAAAAAAAAA");
    expect(p.status).toBe(404);
    expect(p.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "No encontramos esa entrada",
    );
  });
});

describe("share link", () => {
  /** Shares the ticket and returns the public link's path. */
  async function share(token: string) {
    const res = await post(`/ticket/${token}/share`, new FormData());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/ticket/${token}#share`);

    const p = await open(`/ticket/${token}`);
    const url = button(p, "Copiar el enlace")?.getAttribute("data-copy") ?? "";
    expect(url).toMatch(/^https:\/\/up\.test\/charla\/going\/[\w-]{22}$/);
    return new URL(url).pathname;
  }

  test("a ticket offers the share button until it has a link", async () => {
    const token = await registerAs("charla", { email: "sofia@example.com" });
    const ticket = await open(`/ticket/${token}`);
    expect(button(ticket, "Compartir que voy")).not.toBeNull();
    const path = await share(token);
    expect(await share(token)).toBe(path);
  });

  test("the public page names the first name only, and draws the card", async () => {
    const token = await registerAs("charla", {
      email: "rosa@example.com",
      name: "Rosa María Huamán",
    });
    const path = await share(token);

    const p = await open(path);
    expect(p.status).toBe(200);
    expect(p.screen.getByText("Rosa va a")).toBeTruthy();
    expect(p.document.body.textContent).not.toContain("Huamán");
    expect(p.document.documentElement.outerHTML).not.toContain(token);
    expect(p.meta("og:image")).toBe(`https://up.test${path}.png`);

    const png = await get(`${path}.png`);
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await png.arrayBuffer());
    // The PNG signature, then a 1200×630 IHDR.
    expect(bytes.slice(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]));
    const ihdr = new DataView(bytes.buffer, 16, 8);
    expect([ihdr.getUint32(0), ihdr.getUint32(4)]).toEqual([1200, 630]);
  });

  test("cancelling kills the link, and another slug does not serve it", async () => {
    const token = await registerAs("charla", { email: "pedro@example.com" });
    const path = await share(token);
    expect((await get(path.replace("/charla/", "/taller/"))).status).toBe(404);
    await post(`/ticket/${token}/cancel`, new FormData());
    expect((await get(path)).status).toBe(404);
    expect((await get(`${path}.png`)).status).toBe(404);
  });
});

describe("profile", () => {
  /** Opens the ticket holder's profile and returns its path. */
  async function openProfile(token: string) {
    const res = await post(`/ticket/${token}/profile`, new FormData());
    expect(res.status).toBe(303);
    const p = await open(`/ticket/${token}`);
    const link = p.screen.getByRole("link", { name: "Ver mi perfil" });
    const url = new URL(link.getAttribute("href") ?? "");
    expect(url.origin).toBe("https://up.test");
    return url.pathname;
  }

  const badges = (p: Page, heading: string) =>
    [
      ...(p.screen
        .getByRole("region", { name: heading })
        .querySelectorAll("a") ?? []),
    ].map((a) => a.getAttribute("href"));

  test("a check-in offers the profile; it lists attended events only", async () => {
    const email = "valeria@example.com";
    const name = "Valeria Quispe";
    const went = await registerAs("charla", { email, name });
    const skipped = await registerAs("taller", {
      email,
      name,
      q_carrera: "Física",
    });

    expect(button(await open(`/ticket/${went}`), "Crear mi perfil")).toBeNull();
    await checkIn(db, went, now.toISOString());
    expect(
      button(await open(`/ticket/${went}`), "Crear mi perfil"),
    ).not.toBeNull();

    const path = await openProfile(went);
    expect(await openProfile(skipped)).toBe(path);

    const p = await open(path);
    expect(p.status).toBe(200);
    expect(p.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Valeria",
    );
    expect(p.document.body.textContent).not.toContain("Quispe");
    expect(counts(p)).toBe("1 evento");
    expect(
      p.screen.getByText(/^En up\.rising\.sh desde \p{L}+ de \d{4}$/u),
    ).toBeTruthy();
    expect(badges(p, "Insignias")).toEqual(["/charla"]);
    expect(p.document.documentElement.outerHTML).not.toContain(went);
  });

  test("hiding the profile kills its link", async () => {
    const token = await registerAs("charla", { email: "oculta@example.com" });
    await checkIn(db, token, now.toISOString());
    const path = await openProfile(token);

    const res = await post(`/ticket/${token}/profile/hide`, new FormData());
    expect(res.status).toBe(303);
    expect((await get(path)).status).toBe(404);
    expect(
      button(await open(`/ticket/${token}`), "Crear mi perfil"),
    ).not.toBeNull();
  });

  test("a role holder opens a profile before any check-in; the event links to it", async () => {
    const token = await registerAs("charla", {
      email: "ana@example.com",
      name: "Ana Quispe",
    });
    const ticket = await open(`/ticket/${token}`);
    expect(
      button(ticket, "Crear mi perfil"),
      "a role opens the profile before check-in",
    ).not.toBeNull();

    const path = await openProfile(token);
    const profile = await open(path);
    expect(counts(profile)).toBe("0 eventos · 1 organizado");
    expect(badges(profile, "Organiza")).toEqual(["/organizado"]);
    expect(profile.document.documentElement.outerHTML).not.toContain(
      "ana@example.com",
    );

    const event = await open("/organizado");
    const links = event.screen.getAllByRole("link", { name: "Ana Quispe" });
    expect(links.map((a) => a.getAttribute("href"))).toEqual([path, path]);
    const [speakers] = event.screen.getAllByRole("region", {
      name: "Ponentes",
    });
    expect(speakers?.textContent).toContain("Pedro");
    expect(event.screen.queryAllByRole("link", { name: "Pedro" })).toEqual([]);
    expect(event.document.documentElement.outerHTML).not.toContain(
      "ana@example.com",
    );
  });
});

describe("ticket page", () => {
  test("only the fresh notice offers to copy the ticket's link", async () => {
    const token = await registerAs("charla", { email: "nueva@example.com" });
    const url = `https://up.test/ticket/${token}`;

    const fresh = await open(`/ticket/${token}?new`);
    expect(button(fresh, "Copiar el enlace")?.getAttribute("data-copy")).toBe(
      url,
    );
    expect(fresh.document.querySelector("input")).toBeNull();

    const later = await open(`/ticket/${token}`);
    expect(later.document.querySelector(`[data-copy="${url}"]`)).toBeNull();
  });

  test("a check-in drops the calendar and leads with the profile", async () => {
    const token = await registerAs("charla", { email: "dentro@example.com" });
    const before = await open(`/ticket/${token}`);
    expect(
      before.screen.getByRole("link", { name: "Agregar a Google Calendar" }),
    ).toBeTruthy();
    expect(cards(before)).toEqual([
      "Antes del evento",
      "Cuéntale a tus amigos",
    ]);

    await checkIn(db, token, now.toISOString());
    const after = await open(`/ticket/${token}`);
    expect(
      after.screen.queryByRole("link", { name: "Agregar a Google Calendar" }),
    ).toBeNull();
    expect(cards(after)).toEqual([
      "Tus insignias",
      "Durante el evento",
      "Cuéntale a tus amigos",
    ]);
    expect(button(after, "Crear mi perfil")?.classList).toContain(
      "button-primary",
    );
  });
});

describe("certificate", () => {
  const later = createApp({
    now: () => new Date("2026-12-13T12:00:00-05:00"),
    card: cardAssets(),
  });
  const openLater = async (path: string) =>
    page(await later.request(path, {}, env));

  test("a check-in earns a certificate the ticket links once the event is over", async () => {
    const token = await registerAs("charla", {
      email: "certificada@example.com",
      name: "Rosa Mamani",
    });
    await checkIn(db, token, now.toISOString());
    expect(
      (await open(`/ticket/${token}`)).screen.queryByRole("link", {
        name: "Ver mi certificado",
      }),
    ).toBeNull();

    const ticket = await openLater(`/ticket/${token}`);
    expect(ticket.text(".ticket-status")).toBe("Asististe");
    expect(ticket.document.querySelector(".credential")).toBeNull();
    const link = ticket.screen.getByRole("link", {
      name: "Ver mi certificado",
    });
    const url = new URL(link.getAttribute("href") ?? "");
    expect(url.origin).toBe("https://up.test");
    expect((await get(url.pathname)).status, "before the end").toBe(404);

    const p = await openLater(url.pathname);
    expect(p.status).toBe(200);
    expect(p.meta("robots")).toBe("noindex");
    expect(p.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Rosa Mamani",
    );
    expect(p.text(".certificate-verb")).toBe("asistió a");
    expect(p.screen.getByRole("link", { name: "Charla abierta" })).toBeTruthy();
    expect(p.text(".certificate-when")).toBe(
      "12 de diciembre de 2026 · FCF, UNMSM",
    );
    expect(p.button("Imprimir o guardar PDF")).not.toBeNull();
    expect(p.document.documentElement.outerHTML).not.toContain(token);
  });

  test("a role's certificate names the role; a draft or unknown id has none", async () => {
    const [ana] = await eventRoles(db, "organizado");
    const p = await openLater(`/c/${ana?.certificateId}`);
    expect(p.screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Ana Quispe",
    );
    expect(p.text(".certificate-verb")).toBe("organizó");

    await addRole(
      db,
      "borrador",
      await newPerson(db, { name: "Luz" }),
      "speaker",
    );
    const [luz] = await eventRoles(db, "borrador");
    expect((await openLater(`/c/${luz?.certificateId}`)).status).toBe(404);
    expect((await openLater("/c/nope")).status).toBe(404);
  });
});

describe("credential", () => {
  test("only a ticket with a seat carries the credential's data", async () => {
    const token = await registerAs("charla", {
      email: "credencial@example.com",
      name: "Rosa Mamani",
    });
    const credential = async () =>
      (await open(`/ticket/${token}`)).document.querySelector<HTMLElement>(
        ".credential",
      );

    const seated = await credential();
    expect(seated?.hidden).toBe(true);
    expect(seated?.dataset.name).toBe("Rosa Mamani");
    expect(seated?.dataset.title).toBe("Charla abierta");

    const res = await post(`/ticket/${token}/cancel`, new FormData());
    expect(res.status).toBe(303);
    expect(await credential()).toBeNull();
  });
});

describe("reminders", () => {
  test("a day before, each seated ticket gets one reminder", async () => {
    // Every event in this file starts 2026-12-12 at 15:00 Lima.
    expect(
      await sendReminders(
        db,
        env,
        noFetch,
        new Date("2026-12-11T14:00:00-05:00"),
      ),
    ).toBe(0);

    // A ticket taken inside the last day already got its confirmation.
    const late = createApp({
      now: () => new Date("2026-12-11T15:30:00-05:00"),
    });
    await late.request(
      "/charla",
      { method: "POST", body: form({ email: "tarde@example.com" }) },
      env,
    );

    const sent = await sendReminders(
      db,
      env,
      noFetch,
      new Date("2026-12-11T16:00:00-05:00"),
    );
    expect(sent).toBeGreaterThan(0);
    expect(mail.subjects("mail@example.com")).toContain(
      "Recordatorio: Charla abierta",
    );
    expect(mail.subjects("dos@example.com")).toContain(
      "Recordatorio: Taller de Rust",
    );
    expect(mail.subjects("tarde@example.com")).toEqual([
      "Estás inscrito: Charla abierta",
    ]);
    // Cancelled and past tickets get nothing.
    expect(mail.subjects("uno@example.com")).not.toContain(
      "Recordatorio: Taller de Rust",
    );

    expect(
      await sendReminders(
        db,
        env,
        noFetch,
        new Date("2026-12-11T17:00:00-05:00"),
      ),
    ).toBe(0);
  });
});

describe("calendar", () => {
  test("serves an .ics file with escaped text", async () => {
    const res = await get("/charla/calendar.ics");
    expect(res.headers.get("content-type")).toBe(
      "text/calendar; charset=utf-8",
    );
    const lines = (await res.text()).split("\r\n");
    expect(lines).toContain("DTSTART:20261212T200000Z");
    expect(lines).toContain("LOCATION:FCF\\, UNMSM\\, Av. Venezuela s/n");
    expect(lines).toContain("URL:https://up.test/charla");
  });
});

describe("legacy paths", () => {
  test("Spanish links already sent move permanently to English", async () => {
    const cases: [string, string][] = [
      ["/entrada/T1", "/ticket/T1"],
      ["/entrar", "/sign-in"],
      ["/privacidad", "/privacy"],
      ["/charla/voy/S1", "/charla/going/S1"],
    ];

    for (const [from, to] of cases) {
      const res = await get(from);
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe(to);
    }
  });
});

describe("turnstile", () => {
  const calls: URLSearchParams[] = [];
  const guarded = createApp({
    now: () => now,
    fetch: async (url, init) => {
      expect(url).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      );
      const body = new URLSearchParams(String(init.body));
      calls.push(body);
      const token = body.get("response");
      if (token === "caido") return new Response("", { status: 503 });
      return Response.json({ success: token === "humano" });
    },
  });
  const keyed = () => ({
    ...env,
    TURNSTILE_SITE_KEY: "clave-sitio",
    TURNSTILE_SECRET_KEY: "clave-secreta",
  });
  const send = (fields: Record<string, string>) =>
    guarded.request(
      "/charla",
      {
        method: "POST",
        body: form(fields),
        headers: { "CF-Connecting-IP": "203.0.113.7" },
      },
      keyed(),
    );
  const stored = (email: string) =>
    DB.prepare("SELECT id FROM people WHERE email = ?").bind(email).first();

  test("the form carries the widget only with both keys", async () => {
    const widget = (p: Page) => p.document.querySelector(".turnstile");
    expect(widget(await open("/charla"))).toBeNull();

    const p = await page(await guarded.request("/charla", {}, keyed()));
    expect(widget(p)?.getAttribute("data-sitekey")).toBe("clave-sitio");
    expect(p.document.querySelector(".human-check noscript")).not.toBeNull();
  });

  test("a post without a token keeps the values and stores nothing", async () => {
    const p = await page(await send({ email: "sinjs@example.com" }));
    expect(p.status).toBe(422);
    const error = p.screen.getByText(
      /Activa JavaScript o recarga la página\.$/,
    );
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.hasAttribute("autofocus")).toBe(true);
    expect(p.screen.getByLabelText("Correo")).toHaveProperty(
      "value",
      "sinjs@example.com",
    );
    expect(await stored("sinjs@example.com")).toBeNull();
  });

  test("a refused token stores nothing", async () => {
    const p = await page(
      await send({
        email: "robot@example.com",
        "cf-turnstile-response": "robot",
      }),
    );
    expect(p.status).toBe(422);
    expect(
      p.screen.getByText(/^No pudimos confirmar/).getAttribute("role"),
    ).toBe("alert");
    expect(await stored("robot@example.com")).toBeNull();
  });

  test("a person's token registers, with the secret and the IP", async () => {
    const res = await send({
      email: "persona@example.com",
      "cf-turnstile-response": "humano",
    });
    expect(res.status).toBe(303);
    expect(await stored("persona@example.com")).not.toBeNull();
    const call = calls.find((c) => c.get("response") === "humano");
    expect(call?.get("secret")).toBe("clave-secreta");
    expect(call?.get("remoteip")).toBe("203.0.113.7");
  });

  test("a Turnstile outage lets the post through", async () => {
    const res = await send({
      email: "caido@example.com",
      "cf-turnstile-response": "caido",
    });
    expect(res.status).toBe(303);
    expect(await stored("caido@example.com")).not.toBeNull();
  });
});

describe("whatsapp", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const state = { status: 200 };
  const cloud = createApp({
    now: () => now,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("{}", { status: state.status });
    },
  });
  const live = () => ({
    ...env,
    WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    WHATSAPP_TOKEN: "token-de-prueba",
  });
  const send = (fields: Record<string, string>) =>
    cloud.request("/charla", { method: "POST", body: form(fields) }, live());

  test("a registration sends the confirmation template", async () => {
    calls.length = 0;
    const res = await send({
      email: "wa@example.com",
      name: "Lucía Quispe",
      phone: "912 345 678",
    });
    expect(res.status).toBe(303);
    const token = (res.headers.get("location") ?? "").split(/[/?]/)[2];

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(
      "https://graph.facebook.com/v25.0/1234567890/messages",
    );
    const headers = new Headers(call?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer token-de-prueba");
    const body = JSON.parse(String(call?.init.body));
    expect(body.to).toBe("51912345678");
    expect(body.template.name).toBe("up_going");
    expect(body.template.components[0].parameters[0].text).toBe("Lucía");
    expect(body.template.components[0].parameters[1].text).toBe(
      "Charla abierta",
    );
    expect(body.template.components[1].parameters[0].text).toBe(token);
  });

  test("a repeat registration goes by email only", async () => {
    calls.length = 0;
    const res = await send({ email: "wa@example.com", phone: "912 345 678" });
    expect(res.status).toBe(409);
    expect(calls).toHaveLength(0);
  });

  test("a Cloud API error does not fail the registration", async () => {
    calls.length = 0;
    state.status = 500;
    const res = await send({ email: "wa-error@example.com" });
    state.status = 200;
    expect(res.status).toBe(303);
    expect(calls).toHaveLength(1);
    expect(mail.subjects("wa-error@example.com")).toEqual([
      "Estás inscrito: Charla abierta",
    ]);
  });

  test("the mock id logs the message and calls nothing", async () => {
    calls.length = 0;
    const logs: string[] = [];
    const log = console.log;
    console.log = (line: string) => logs.push(line);
    try {
      const res = await cloud.request(
        "/charla",
        { method: "POST", body: form({ email: "wa-mock@example.com" }) },
        { ...env, WHATSAPP_PHONE_NUMBER_ID: "mock" },
      );
      expect(res.status).toBe(303);
    } finally {
      console.log = log;
    }
    expect(calls).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toStartWith("whatsapp mock: up_going to +51…321\n");
    expect(logs[0]).toContain("Hola, Ana. Tu cupo en Charla abierta");
  });

  test("the settings say which mode runs", async () => {
    const cookie = await adminCookie(db, now);
    const mode = async (vars: Partial<Env>) => {
      const res = await app.request(
        "/admin/settings",
        { headers: { cookie } },
        { ...env, ...vars },
      );
      const p = await page(res);
      return p.screen.queryByText(/^(Desactivado|Simulado|Conectado)\./)
        ?.textContent;
    };
    expect(await mode({})).toStartWith("Desactivado.");
    expect(await mode({ WHATSAPP_PHONE_NUMBER_ID: "mock" })).toStartWith(
      "Simulado.",
    );
    expect(await mode(live())).toStartWith("Conectado.");
  });
});
