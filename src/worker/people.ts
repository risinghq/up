import { sql } from "kysely";
import type { Db } from "./db";
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
  db: Db,
  r: Registration,
  now: string,
  proven: boolean,
): Promise<string> {
  const row = await db
    .insertInto("people")
    .values({
      id: crypto.randomUUID(),
      email: r.email,
      name: r.name,
      phone: r.phone,
      privacy_accepted_at: now,
      news_opt_in_at: r.newsOptIn ? now : null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("email").doUpdateSet({
        name: proven ? sql`excluded.name` : sql`people.name`,
        phone: proven
          ? sql`excluded.phone`
          : sql`coalesce(people.phone, excluded.phone)`,
        privacy_accepted_at: sql`excluded.privacy_accepted_at`,
        // Unticking the news box on a later form does not withdraw an
        // earlier opt-in; withdrawal is its own request.
        news_opt_in_at: sql`coalesce(people.news_opt_in_at, excluded.news_opt_in_at)`,
        updated_at: sql`excluded.updated_at`,
      }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();

  return row.id;
}

/** Updates the account's own name and phone, from the account page. */
export async function updateContact(
  db: Db,
  id: string,
  contact: { name: string; phone: string | null },
  now: string,
) {
  await db
    .updateTable("people")
    .set({ name: contact.name, phone: contact.phone, updated_at: now })
    .where("id", "=", id)
    .execute();
}

export async function phoneOf(db: Db, id: string): Promise<string | null> {
  const row = await db
    .selectFrom("people")
    .select("phone")
    .where("id", "=", id)
    .executeTakeFirst();
  return row?.phone ?? null;
}
