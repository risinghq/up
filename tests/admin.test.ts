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
import { softPasskey } from "./authenticator";
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
    hosts: "David, Pedro",
    capacity: "30",
    questions: "Carrera*\nNivel: Básico | Avanzado",
    status: "published",
    kind: "taller",
    accent: "#7C3AED",
    backdrop: "dots",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const png = (name = "portada.png") =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
    type: "image/png",
  });

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

  test("admin pages are not cached", async () => {
    const res = await get("/admin");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("Hola, David");
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
      "/admin/eventos/taller-qiskit?guardado",
    );
    const saved = await findEvent(DB, "taller-qiskit");
    expect(saved).toMatchObject({
      start: "2027-01-16T10:00:00-05:00",
      hosts: ["David", "Pedro"],
      capacity: 30,
      questions: [
        { id: "carrera", label: "Carrera", required: true },
        { id: "nivel", label: "Nivel", options: ["Básico", "Avanzado"] },
      ],
      theme: { kind: "taller", accent: "#7c3aed", backdrop: "dots" },
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
    const html = await (await get("/", {})).text();
    expect(html).toContain("Taller de Qiskit");
  });

  test("a refused form keeps its values and names the fields", async () => {
    const res = await post(
      "/admin/eventos/nuevo",
      eventForm({ slug: "admin", end: "2027-01-16T09:00", accent: "azul" }),
    );
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain("Esa dirección la usa el sitio");
    expect(html).toContain("El fin va después del inicio.");
    expect(html).toContain("Un color como #2563eb.");
    expect(html).toContain('value="Taller de Qiskit"');
  });

  test("a taken slug is refused", async () => {
    const res = await post(
      "/admin/eventos/nuevo",
      eventForm({ slug: "vacio" }),
    );
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("Ya hay un evento con esta dirección.");
  });

  test("renames an event without registrations and replaces its cover", async () => {
    const before = await findEvent(DB, "taller-qiskit");
    const res = await post(
      "/admin/eventos/taller-qiskit",
      eventForm({ slug: "qiskit", cover: png("nueva.png") }),
    );
    expect(res.status).toBe(303);
    expect(await findEvent(DB, "taller-qiskit")).toBeNull();
    const after = await findEvent(DB, "qiskit");
    expect(after?.coverKey).toMatch(/^covers\/qiskit-/);
    expect(await MEDIA.head(before?.coverKey ?? "")).toBeNull();

    await post(
      "/admin/eventos/qiskit",
      eventForm({ slug: "qiskit", remove_cover: "on" }),
    );
    expect((await findEvent(DB, "qiskit"))?.coverKey).toBeUndefined();
    expect(await MEDIA.head(after?.coverKey ?? "")).toBeNull();
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
      "/admin/eventos/lleno",
      eventForm({ slug: "otro", title: "Con inscritos", capacity: "2" }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/eventos/lleno?guardado");

    // The raised capacity seats the waitlisted registrant at once.
    const seated = await DB.prepare(
      "SELECT COUNT(*) AS n FROM registrations WHERE event_slug = 'lleno' AND status = 'going'",
    ).first<{ n: number }>();
    expect(seated?.n).toBe(2);

    const removal = await post("/admin/eventos/lleno/eliminar", new FormData());
    expect(removal.status).toBe(409);
    expect(await findEvent(DB, "lleno")).not.toBeNull();
  });

  test("deletes an event without registrations", async () => {
    const res = await post("/admin/eventos/vacio/eliminar", new FormData());
    expect(res.status).toBe(303);
    expect(await findEvent(DB, "vacio")).toBeNull();
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

  test("the list links each WhatsApp number", async () => {
    const html = await (await get("/admin/eventos/estrella/inscritos")).text();
    expect(html).toContain('href="https://wa.me/51987654321"');
  });
});

describe("passkeys", () => {
  test("an invite makes an admin who then signs in", async () => {
    const page = await post("/admin/invitaciones", new FormData());
    expect(page.status).toBe(422);
    const invited = new FormData();
    invited.set("name", "Pedro");
    const html = await (await post("/admin/invitaciones", invited)).text();
    const url = html.match(
      /https:\/\/up\.test\/admin\/invitacion\/[\w-]+/,
    )?.[0];
    expect(url).toBeDefined();
    const token = (url ?? "").split("/").pop() ?? "";
    expect(
      await (await get(`/admin/invitacion/${token}`, {})).text(),
    ).toContain("Hola, Pedro");

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
    expect(
      await (await get("/admin", { cookie: session ?? "" })).text(),
    ).toContain("Hola, Pedro");

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
