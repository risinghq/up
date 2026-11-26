import type { Registration } from "./form";

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * Stores the person behind an email and returns their id. Anyone can type an
 * email, so an unproven registration keeps the stored name and phone and only
 * fills a phone that is missing: otherwise a stranger could rename a person or
 * send their ticket links to another WhatsApp. A `proven` registration comes
 * from the signed-in owner of the email and updates both.
 */
export async function upsertPerson(
  db: D1Database,
  r: Registration,
  now: string,
  proven: boolean,
): Promise<string> {
  // Unticking the news box on a later form does not withdraw an earlier
  // opt-in; withdrawal is its own request.
  const row = await db
    .prepare(
      `INSERT INTO people (id, email, name, phone, privacy_accepted_at, news_opt_in_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?5, ?5)
       ON CONFLICT (email) DO UPDATE SET
         name = CASE WHEN ?7 THEN excluded.name ELSE people.name END,
         phone = CASE WHEN ?7 THEN excluded.phone ELSE COALESCE(people.phone, excluded.phone) END,
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
      proven ? 1 : 0,
    )
    .first<{ id: string }>();
  if (!row) throw new Error("people upsert returned no row");

  return row.id;
}

/** Updates the account's own name and phone, from the account page. */
export async function updateContact(
  db: D1Database,
  id: string,
  contact: { name: string; phone: string | null },
  now: string,
) {
  await db
    .prepare(
      "UPDATE people SET name = ?, phone = ?, updated_at = ? WHERE id = ?",
    )
    .bind(contact.name, contact.phone, now, id)
    .run();
}

export async function phoneOf(
  db: D1Database,
  id: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT phone FROM people WHERE id = ?")
    .bind(id)
    .first<{ phone: string | null }>();
  return row?.phone ?? null;
}
