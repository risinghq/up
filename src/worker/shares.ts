import { sql } from "kysely";
import type { Db } from "./db";
import { firstName } from "./people";
import { newToken } from "./tokens";

export type Share = { eventSlug: string; firstName: string };

/**
 * The ticket's public share id, made on the first call. A cancelled ticket
 * gets none.
 */
export async function shareTicket(
  db: Db,
  token: string,
): Promise<string | null> {
  const row = await db
    .updateTable("registrations")
    .set({ share_id: sql`coalesce(share_id, ${newToken()})` })
    .where("id", "=", token)
    .where("status", "!=", "cancelled")
    .returning("share_id")
    .executeTakeFirst();
  return row?.share_id ?? null;
}

/** What a share link shows: the event and the holder's first name only. */
export async function findShare(
  db: Db,
  shareId: string,
): Promise<Share | null> {
  const row = await db
    .selectFrom("registrations as r")
    .innerJoin("people as p", "p.id", "r.person_id")
    .select(["r.event_slug as eventSlug", "p.name"])
    .where("r.share_id", "=", shareId)
    .executeTakeFirst();
  return row
    ? { eventSlug: row.eventSlug, firstName: firstName(row.name) }
    : null;
}
