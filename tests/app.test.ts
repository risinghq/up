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
import {
  adminCookie,
  event,
  form,
  HOST_TIMEOUT,
  migratedDb,
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
];

const app = createApp({ now: () => now });

let mf: Miniflare;
let DB: D1Database;
let env: Env;

beforeAll(async () => {
  let MEDIA: R2Bucket;
  ({ mf, DB, MEDIA } = await migratedDb("app"));
  env = testEnv(DB, MEDIA);
  await seed(DB, events);
});

afterAll(() => mf.dispose());

const get = (path: string, headers: Record<string, string> = {}) =>
  app.request(path, { headers }, env);

const post = (path: string, body: FormData) =>
  app.request(path, { method: "POST", body }, env);

/** Registers and returns the ticket token from the redirect. */
async function registerAs(slug: string, fields: Record<string, string>) {
  const res = await post(`/${slug}`, form(fields));
  expect(res.status).toBe(303);
  const location = res.headers.get("location") ?? "";
  expect(location).toMatch(/^\/entrada\/[\w-]{22}\?nueva$/);
  return location.slice("/entrada/".length, -"?nueva".length);
}

describe("home", () => {
  test("lists upcoming events and hides drafts", async () => {
    const html = await (await get("/")).text();
    expect(html).toContain("Taller de Rust");
    expect(html).toContain("Charla abierta");
    expect(html).not.toContain("Evento pasado");
    expect(html).not.toContain("Evento en borrador");
  });

  test("preloads the Geist file the stylesheet uses", async () => {
    const html = await (await get("/")).text();
    expect(html).toContain(
      '<link rel="preload" href="/assets/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin="anonymous"/>',
    );
  });

  test("sets the scheme before paint, with a theme-color for each", async () => {
    const html = await (await get("/")).text();
    const script = html.indexOf('classList.toggle("dark"');
    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(html.indexOf("/assets/client.css"));
    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: light)" data-scheme="light" content="#f2f2f2"/>',
    );
    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" data-scheme="dark" content="#141414"/>',
    );
    expect(html).toContain('<button class="theme-toggle"');
  });

  test("the past tab lists ended events", async () => {
    const html = await (await get("/?ver=pasados")).text();
    expect(html).toContain("Evento pasado");
    expect(html).not.toContain("Taller de Rust");
  });

  test("a draft is served only to a signed-in admin", async () => {
    expect((await get("/borrador")).status).toBe(404);
    const cookie = await adminCookie(DB, now);
    const res = await get("/borrador", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain('name="robots" content="noindex"');
    const home = await (await get("/", { cookie })).text();
    expect(home).toContain("Evento en borrador");
  });
});

describe("event page", () => {
  test("carries the link preview tags", async () => {
    const html = await (await get("/charla")).text();
    expect(html).toContain(
      '<meta property="og:title" content="Charla abierta"/>',
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://up.test/charla"/>',
    );
  });

  test("an ended event shows the recording and refuses registrations", async () => {
    const html = await (await get("/pasado")).text();
    expect(html).toContain("https://youtu.be/test");
    expect(html).not.toContain("<form");
    const res = await post("/pasado", form({ email: "late@example.com" }));
    expect(res.status).toBe(410);
  });

  test("keeps its nav in place, where the home nav sticks", async () => {
    const home = await (await get("/")).text();
    expect(home).toContain('<header class="site-nav sticky">');
    const page = await (await get("/charla")).text();
    expect(page).toContain('<header class="site-nav">');
  });

  test("a tinted event marks its page for the dark palette", async () => {
    const html = await (await get("/charla")).text();
    expect(html).toMatch(/<body class="tint [^"]* tinted"/);
    expect(html).not.toContain('data-scheme="dark" content="#141414"');
  });

  test("shows the kind only when the title does not name it", async () => {
    const named = await (await get("/taller")).text();
    expect(named).not.toContain('class="category"');
    const unnamed = await (await get("/charla")).text();
    expect(unnamed).toMatch(/class="category">.*Taller<\/span>/);
  });

  test("an unknown slug is a 404 page", async () => {
    const res = await get("/no-existe");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("No encontramos esta página");
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

    const res = await get(`/entrada/${token}?nueva`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("¡Listo, Luis!");
    expect(html).toContain("Tienes un cupo");
    expect(html).toContain("#1");
    expect(html).toContain(`https://up.test/entrada/${token}`);
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
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain('value="Eva"');
    expect(html).toContain("Escribe un correo válido.");
    expect(html).toContain("Escribe un número de WhatsApp");
    expect(html).toContain("Necesitamos tu aceptación");
    expect(html).toContain("Responde esta pregunta."); // carrera
    expect(html).toContain("Elige una de las opciones."); // nivel
  });

  test("an email already registered gets no ticket link", async () => {
    await registerAs("charla", { email: "twice@example.com" });
    const res = await post("/charla", form({ email: "twice@example.com" }));
    expect(res.status).toBe(409);
    expect(res.headers.get("location")).toBeNull();
    const html = await res.text();
    expect(html).toContain("Este correo ya está inscrito");
    expect(html).not.toContain("/entrada/");
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

    expect(await (await get(`/entrada/${second}`)).text()).toContain(
      "Estás en la lista de espera",
    );
    expect(await (await get("/taller")).text()).toContain(
      "Unirme a la lista de espera",
    );

    const cancelled = await post(`/entrada/${first}/cancelar`, new FormData());
    expect(cancelled.status).toBe(303);
    expect(await (await get(`/entrada/${first}`)).text()).toContain(
      "Cancelaste tu inscripción",
    );
    expect(await (await get(`/entrada/${second}`)).text()).toContain(
      "Tienes un cupo",
    );
  });

  test("registering again after cancelling issues a new ticket", async () => {
    const old = await registerAs("charla", { email: "vuelve@example.com" });
    await post(`/entrada/${old}/cancelar`, new FormData());
    const fresh = await registerAs("charla", { email: "vuelve@example.com" });
    expect(fresh).not.toBe(old);
    expect((await get(`/entrada/${old}`)).status).toBe(404);
    expect(await (await get(`/entrada/${fresh}`)).text()).toContain(
      "Tienes un cupo",
    );
  });

  test("an unknown ticket is a 404", async () => {
    const res = await get("/entrada/AAAAAAAAAAAAAAAAAAAAAA");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("No encontramos esa entrada");
  });
});

describe("calendar", () => {
  test("serves an .ics file with escaped text", async () => {
    const res = await get("/charla/calendario.ics");
    expect(res.headers.get("content-type")).toBe(
      "text/calendar; charset=utf-8",
    );
    const body = await res.text();
    expect(body).toContain("DTSTART:20261212T200000Z\r\n");
    expect(body).toContain("LOCATION:FCF\\, UNMSM\\, Av. Venezuela s/n\r\n");
    expect(body).toContain("URL:https://up.test/charla\r\n");
  });
});
