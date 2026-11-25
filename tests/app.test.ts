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
  cardAssets,
  event,
  form,
  HOST_TIMEOUT,
  migratedDb,
  outbox,
  seed,
  testEnv,
} from "./support";
import { sendReminders } from "../src/worker/reminders";

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

const app = createApp({ now: () => now, card: cardAssets() });

let mf: Miniflare;
let DB: D1Database;
let env: Env;
const mail = outbox();

beforeAll(async () => {
  let MEDIA: R2Bucket;
  ({ mf, DB, MEDIA } = await migratedDb("app"));
  env = testEnv(DB, MEDIA, { EMAIL: mail.binding });
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

  test("a registration emails the ticket link", async () => {
    const token = await registerAs("charla", { email: "mail@example.com" });
    const [message] = mail.sent.filter((m) => m.to === "mail@example.com");
    expect(message?.subject).toBe("Estás inscrito: Charla abierta");
    expect(message?.text).toContain(`https://up.test/entrada/${token}`);
    expect(message?.text).toContain("Hola, Ana:");
    expect(message?.html).toContain(`href="https://up.test/entrada/${token}"`);
  });

  test("an email already registered gets its link by email, not on the page", async () => {
    const token = await registerAs("charla", { email: "twice@example.com" });
    const res = await post("/charla", form({ email: "twice@example.com" }));
    expect(res.status).toBe(409);
    expect(res.headers.get("location")).toBeNull();
    const html = await res.text();
    expect(html).toContain("Este correo ya está inscrito");
    expect(html).not.toContain("/entrada/");

    // A third post inside the cooldown sends nothing more.
    await post("/charla", form({ email: "twice@example.com" }));
    expect(mail.subjects("twice@example.com")).toEqual([
      "Estás inscrito: Charla abierta",
      "Tu entrada: Charla abierta",
    ]);
    const resent = mail.sent.filter((m) => m.to === "twice@example.com")[1];
    expect(resent?.text).toContain(`/entrada/${token}`);
  });

  test("a title with markup is escaped in the email", async () => {
    await seed(DB, [event({ slug: "marcado", title: "<b>Taller</b> & más" })]);
    await registerAs("marcado", { email: "marcado@example.com" });
    const message = mail.sent.find((m) => m.to === "marcado@example.com");
    expect(message?.html).toContain("&lt;b&gt;Taller&lt;/b&gt; &amp; más");
    expect(message?.html).not.toContain("<b>Taller");
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
    expect(mail.subjects("dos@example.com")).toEqual([
      "Estás en la lista de espera: Taller de Rust",
      "Tienes cupo: Taller de Rust",
    ]);
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

describe("share link", () => {
  /** Shares the ticket and returns the public link's path. */
  async function share(token: string) {
    const res = await post(`/entrada/${token}/compartir`, new FormData());
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/entrada/${token}#compartir`);
    const html = await (await get(`/entrada/${token}`)).text();
    const url = html.match(/https:\/\/up\.test(\/charla\/voy\/[\w-]{22})/);
    expect(url).not.toBeNull();
    return url?.[1] ?? "";
  }

  test("a ticket offers the share button until it has a link", async () => {
    const token = await registerAs("charla", { email: "sofia@example.com" });
    const before = await (await get(`/entrada/${token}`)).text();
    expect(before).toContain("Compartir que voy");
    const path = await share(token);
    expect(await share(token)).toBe(path);
  });

  test("the public page names the first name only, and draws the card", async () => {
    const token = await registerAs("charla", {
      email: "rosa@example.com",
      name: "Rosa María Huamán",
    });
    const path = await share(token);

    const res = await get(path);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Rosa va a");
    expect(html).not.toContain("Huamán");
    expect(html).not.toContain(token);
    expect(html).toContain(
      `<meta property="og:image" content="https://up.test${path}.png"/>`,
    );

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
    await post(`/entrada/${token}/cancelar`, new FormData());
    expect((await get(path)).status).toBe(404);
    expect((await get(`${path}.png`)).status).toBe(404);
  });
});

describe("reminders", () => {
  test("a day before, each seated ticket gets one reminder", async () => {
    // Every event in this file starts 2026-12-12 at 15:00 Lima.
    expect(
      await sendReminders(env, new Date("2026-12-11T14:00:00-05:00")),
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
      env,
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
      await sendReminders(env, new Date("2026-12-11T17:00:00-05:00")),
    ).toBe(0);
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
