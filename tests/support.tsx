import { readdirSync, readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createSession } from "../src/worker/auth";
import { saveEvent, type EventMeta } from "../src/worker/events";
import type { Env } from "../src/worker/app";
import type { CardAssets } from "../src/worker/card";

// Every D1 call crosses into Miniflare's worker process, so a test of a few
// dozen requests outgrows bun's 5 s default on a loaded host. Bun resets the
// default per file; each file calls `setDefaultTimeout(HOST_TIMEOUT)`.
export const HOST_TIMEOUT = 30_000;

/** The site origin in tests; a form post must name it to pass CSRF. */
export const ORIGIN = "https://up.test";

const migrationsDir = new URL("../migrations/", import.meta.url);

const statements = (sql: string) =>
  sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, "").trim())
    .filter(Boolean);

/** A Miniflare D1 database with every migration applied, and an R2 bucket. */
export async function migratedDb(name: string) {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('') } }",
    d1Databases: { DB: name },
    r2Buckets: { MEDIA: `${name}-media` },
  });
  const DB = await mf.getD1Database("DB");
  const MEDIA = await mf.getR2Bucket("MEDIA");
  const sql = readdirSync(migrationsDir)
    .sort()
    .flatMap((file) =>
      statements(readFileSync(new URL(file, migrationsDir), "utf8")),
    );
  await DB.batch(sql.map((s) => DB.prepare(s)));
  return { mf, DB, MEDIA: bunReadable(MEDIA as unknown as R2Bucket) };
}

/**
 * Bun cannot read a stream that Miniflare proxies from its worker process
 * (DataCloneError), so objects come back with their bytes in a local stream.
 */
function bunReadable(bucket: R2Bucket): R2Bucket {
  return new Proxy(bucket, {
    get(target, prop) {
      if (prop !== "get") return Reflect.get(target, prop).bind(target);
      return async (key: string) => {
        const object = await target.get(key);
        if (!object) return null;
        const bytes = await object.arrayBuffer();
        return {
          key: object.key,
          httpEtag: object.httpEtag,
          httpMetadata: object.httpMetadata,
          body: new Response(bytes).body,
        };
      };
    },
  });
}

const packageFile = (specifier: string) =>
  readFileSync(new URL(import.meta.resolve(specifier)));

/**
 * The share card's assets read from node_modules, as the Worker build
 * bundles them in src/worker/cardAssets.ts.
 */
export function cardAssets(): CardAssets {
  const font = (weight: number) =>
    readFileSync(
      new URL(`../src/worker/fonts/geist-${weight}.woff`, import.meta.url),
    ).buffer as ArrayBuffer;
  return {
    layout: new WebAssembly.Module(packageFile("satori/yoga.wasm")),
    resvg: new WebAssembly.Module(
      packageFile("@resvg/resvg-wasm/index_bg.wasm"),
    ),
    geist400: font(400),
    geist600: font(600),
  };
}

/** An EMAIL binding that keeps what it is asked to send. */
export function outbox() {
  const sent: EmailMessageBuilder[] = [];
  const binding = {
    send: async (message: EmailMessageBuilder) => {
      sent.push(message);
      return { messageId: `m${sent.length}` };
    },
  } as unknown as SendEmail;
  /** The subjects sent to one address, oldest first. */
  const subjects = (to: string) =>
    sent.filter((m) => m.to === to).map((m) => m.subject);
  return { sent, binding, subjects };
}

export function testEnv(
  DB: D1Database,
  MEDIA: R2Bucket,
  vars: Partial<Env> = {},
): Env {
  return {
    DB,
    MEDIA,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
    SITE_URL: ORIGIN,
    WHATSAPP_COMMUNITY_URL: "https://chat.whatsapp.com/test",
    INSTAGRAM_URL: "",
    ...vars,
  };
}

export function event(
  meta: Partial<EventMeta> & Pick<EventMeta, "slug">,
): EventMeta {
  return {
    title: `Evento ${meta.slug}`,
    summary: "Un evento de prueba.",
    body: "Cuerpo del evento.",
    start: "2026-12-12T15:00:00-05:00",
    end: "2026-12-12T19:00:00-05:00",
    place: {
      kind: "venue",
      name: "FCF, UNMSM",
      address: "Av. Venezuela s/n",
    },
    questions: [],
    status: "published",
    theme: {
      kind: "taller",
      accent: "#2563eb",
      backdrop: "grid",
      font: "sans",
    },
    featured: false,
    ...meta,
  };
}

/** Stores events as an admin would. */
export async function seed(DB: D1Database, events: EventMeta[]) {
  for (const e of events) await saveEvent(DB, e, "2026-11-01T00:00:00.000Z");
}

type NewPerson = { name?: string; email?: string; admin?: boolean };

/** Stores a person, as signing in or registering would, and returns its id. */
export async function newPerson(
  DB: D1Database,
  person: NewPerson = {},
  at = "2026-11-01T00:00:00.000Z",
) {
  const id = crypto.randomUUID();
  await DB.prepare(
    "INSERT INTO people (id, email, name, admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      person.email ?? null,
      person.name ?? "David",
      person.admin ? 1 : 0,
      at,
      at,
    )
    .run();
  return id;
}

/**
 * Creates an account and returns its id and the Cookie header of a session
 * opened at `now`, which must fall within 30 days before the test's clock.
 */
export async function signedIn(
  DB: D1Database,
  now: Date,
  person: NewPerson = {},
) {
  const at = now.toISOString();
  const id = await newPerson(DB, person, at);
  const token = await createSession(DB, id, at);
  return { id, cookie: `up_session=${token}` };
}

/** Creates an admin and returns the Cookie header of their session. */
export async function adminCookie(DB: D1Database, now: Date, name = "David") {
  return (await signedIn(DB, now, { name, admin: true })).cookie;
}

/** A form body that registers; `overrides` replaces or adds fields. */
export function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields = {
    name: "Ana Pérez",
    email: "ana@example.com",
    phone: "987 654 321",
    privacy: "on",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields))
    if (value !== "") data.set(key, value);
  return data;
}
