import { firstName } from "./people";
import { newToken } from "./tokens";

export type Share = { eventSlug: string; firstName: string };

/**
 * The ticket's public share id, made on the first call. A cancelled ticket
 * gets none.
 */
export async function shareTicket(
  db: D1Database,
  token: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `UPDATE registrations SET share_id = COALESCE(share_id, ?)
       WHERE id = ? AND status != 'cancelled'
       RETURNING share_id AS shareId`,
    )
    .bind(newToken(), token)
    .first<{ shareId: string }>();
  return row?.shareId ?? null;
}

/** What a share link shows: the event and the holder's first name only. */
export async function findShare(
  db: D1Database,
  shareId: string,
): Promise<Share | null> {
  const row = await db
    .prepare(
      `SELECT r.event_slug AS eventSlug, p.name
       FROM registrations r JOIN people p ON p.id = r.person_id
       WHERE r.share_id = ?`,
    )
    .bind(shareId)
    .first<{ eventSlug: string; name: string }>();
  return row && { eventSlug: row.eventSlug, firstName: firstName(row.name) };
}
