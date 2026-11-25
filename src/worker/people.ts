import type { Registration } from "./form";

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Stores the person behind an email with the latest values they gave; returns their id. */
export async function upsertPerson(
  db: D1Database,
  r: Registration,
  now: string,
): Promise<string> {
  // Unticking the news box on a later form does not withdraw an earlier
  // opt-in; withdrawal is its own request.
  const row = await db
    .prepare(
      `INSERT INTO people (id, email, name, phone, privacy_accepted_at, news_opt_in_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?5, ?5)
       ON CONFLICT (email) DO UPDATE SET
         name = excluded.name,
         phone = excluded.phone,
         privacy_accepted_at = excluded.privacy_accepted_at,
         news_opt_in_at = COALESCE(people.news_opt_in_at, excluded.news_opt_in_at),
         updated_at = excluded.updated_at
       RETURNING id`,
    )
    .bind(
      crypto.randomUUID(),
      r.email,
      r.name,
      r.phone,
      now,
      r.newsOptIn ? now : null,
    )
    .first<{ id: string }>();
  if (!row) throw new Error("people upsert returned no row");

  return row.id;
}
