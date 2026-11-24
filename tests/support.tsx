import { readdirSync, readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import type { EventEntry, EventMeta } from "../src/events/types";
import type { Env } from "../src/worker/app";

// Every D1 call crosses into Miniflare's worker process, so a test of a few
// dozen requests outgrows bun's 5 s default on a loaded host. Bun resets the
// default per file; each file calls `setDefaultTimeout(HOST_TIMEOUT)`.
export const HOST_TIMEOUT = 30_000;

const migrationsDir = new URL("../migrations/", import.meta.url);

const statements = (sql: string) =>
  sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, "").trim())
    .filter(Boolean);

/** A Miniflare D1 database with every migration applied. */
export async function migratedDb(name: string) {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('') } }",
    d1Databases: { DB: name },
  });
  const DB = await mf.getD1Database("DB");
  const sql = readdirSync(migrationsDir)
    .sort()
    .flatMap((file) =>
      statements(readFileSync(new URL(file, migrationsDir), "utf8")),
    );
  await DB.batch(sql.map((s) => DB.prepare(s)));
  return { mf, DB };
}

export function testEnv(DB: D1Database, vars: Partial<Env> = {}): Env {
  return {
    DB,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
    SITE_URL: "https://up.test",
    WHATSAPP_COMMUNITY_URL: "https://chat.whatsapp.com/test",
    INSTAGRAM_URL: "",
    SHOW_DRAFTS: "",
    ...vars,
  };
}

export function event(
  meta: Partial<EventMeta> & Pick<EventMeta, "slug">,
): EventEntry {
  return {
    meta: {
      title: `Evento ${meta.slug}`,
      summary: "Un evento de prueba.",
      start: "2026-12-12T15:00:00-05:00",
      end: "2026-12-12T19:00:00-05:00",
      place: {
        kind: "venue",
        name: "FCF, UNMSM",
        address: "Av. Venezuela s/n",
      },
      hosts: ["David"],
      questions: [],
      ...meta,
    },
    Body: () => <p>Cuerpo del evento.</p>,
  };
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
