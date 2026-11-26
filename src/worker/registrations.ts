import type { EventMeta } from "./events";
import type { Registration } from "./form";
import { upsertPerson } from "./people";
import { newToken } from "./tokens";

export type Status = "going" | "waitlist" | "cancelled";

export type Ticket = {
  token: string;
  eventSlug: string;
  number: number;
  status: Status;
  name: string;
  email: string;
  /** E.164, as the form stored it. */
  phone: string;
  createdAt: string;
  /** When an admin let the person in at the door. */
  checkedInAt: string | null;
  /** The public "voy" link's id, once the holder shared the ticket. */
  shareId: string | null;
  /** The holder's public profile id, once they opened it. */
  profileId: string | null;
  /** The id of the ticket's certificate at /c/<id>, from the first check-in. */
  certificateId: string | null;
};

export type RegisterResult =
  | { kind: "created"; token: string; status: "going" | "waitlist" }
  | { kind: "exists"; token: string };

/** A repeat registration resends the ticket link at most this often. */
export const RESEND_COOLDOWN = 15 * 60 * 1000;

/**
 * The status a new or revived registration takes, decided in the statement
 * that writes it, so two registrations at once cannot both take the last
 * seat. ?2 is the event's slug and ?7 its capacity, NULL for no limit.
 */
const seatOrWaitlist = `CASE WHEN ?7 IS NULL OR
  (SELECT COUNT(*) FROM registrations WHERE event_slug = ?2 AND status = 'going') < ?7
  THEN 'going' ELSE 'waitlist' END`;

export async function goingCount(
  db: D1Database,
  slug: string,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM registrations WHERE event_slug = ? AND status = 'going'",
    )
    .bind(slug)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Registers a person for an event. An email already holding a live ticket
 * gets `exists` with that ticket's token, which the caller mails to the
 * address and never shows, so typing someone's email does not open their
 * ticket. A cancelled ticket comes back to life under a new token.
 */
export async function register(
  db: D1Database,
  event: EventMeta,
  r: Registration,
  now: string,
): Promise<RegisterResult> {
  const personId = await upsertPerson(db, r, now);
  const existing = await db
    .prepare(
      "SELECT id, status FROM registrations WHERE event_slug = ? AND person_id = ?",
    )
    .bind(event.slug, personId)
    .first<{ id: string; status: Status }>();
  if (existing && existing.status !== "cancelled")
    return { kind: "exists", token: existing.id };

  const token = newToken();
  const answers = JSON.stringify(r.answers);
  const capacity = event.capacity ?? null;

  // The number, like the status, is taken in the statement that inserts.
  const statement = existing
    ? db
        .prepare(
          `UPDATE registrations SET id = ?1, status = ${seatOrWaitlist}, answers = ?4,
             created_at = ?5, cancelled_at = NULL, checked_in_at = NULL, share_id = NULL
           WHERE id = ?6
           RETURNING status`,
        )
        .bind(token, event.slug, null, answers, now, existing.id, capacity)
    : db
        .prepare(
          `INSERT INTO registrations (id, event_slug, person_id, number, status, answers, created_at)
           SELECT ?1, ?2, ?3, COALESCE(MAX(number), 0) + 1, ${seatOrWaitlist}, ?4, ?5
           FROM registrations WHERE event_slug = ?2
           RETURNING status`,
        )
        .bind(token, event.slug, personId, answers, now, null, capacity);

  const row = await statement.first<{ status: "going" | "waitlist" }>();
  if (!row) throw new Error("registration write returned no row");

  return { kind: "created", token, status: row.status };
}

export async function findTicket(
  db: D1Database,
  token: string,
): Promise<Ticket | null> {
  return db
    .prepare(
      `SELECT r.id AS token, r.event_slug AS eventSlug, r.number, r.status, p.name, p.email, p.phone,
              r.created_at AS createdAt, r.checked_in_at AS checkedInAt, r.share_id AS shareId,
              p.profile_id AS profileId, r.certificate_id AS certificateId
       FROM registrations r JOIN people p ON p.id = r.person_id
       WHERE r.id = ?`,
    )
    .bind(token)
    .first<Ticket>();
}

/**
 * Records that the ticket's holder came in, and gives the ticket its
 * certificate id once. A cancelled ticket cannot, and a second check-in keeps
 * the first time.
 */
export async function checkIn(
  db: D1Database,
  token: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE registrations SET checked_in_at = ?, certificate_id = COALESCE(certificate_id, ?)
       WHERE id = ? AND status != 'cancelled' AND checked_in_at IS NULL`,
    )
    .bind(now, newToken(), token)
    .run();
}

/**
 * Registers a person who came to the door and checks them in. They take a
 * seat past the capacity: the door already let them in. A person who was
 * registered keeps their ticket and is checked in on it.
 */
export async function walkIn(
  db: D1Database,
  event: EventMeta,
  r: Registration,
  now: string,
): Promise<{ kind: "created" | "exists"; ticket: Ticket }> {
  const result = await register(db, { ...event, capacity: undefined }, r, now);
  await checkIn(db, result.token, now);

  const ticket = await findTicket(db, result.token);
  if (!ticket) throw new Error("walk-in ticket vanished");

  return { kind: result.kind, ticket };
}

export async function undoCheckIn(
  db: D1Database,
  token: string,
): Promise<void> {
  await db
    .prepare("UPDATE registrations SET checked_in_at = NULL WHERE id = ?")
    .bind(token)
    .run();
}

/**
 * Cancels a ticket. A freed seat goes to the oldest waitlisted registration;
 * returns the tokens of the tickets that got a seat.
 */
export async function cancel(
  db: D1Database,
  event: EventMeta,
  token: string,
  now: string,
): Promise<string[]> {
  const ticket = await db
    .prepare(
      "SELECT status, checked_in_at FROM registrations WHERE id = ? AND event_slug = ?",
    )
    .bind(token, event.slug)
    .first<{ status: Status; checked_in_at: string | null }>();
  // A person already let in has attended; cancelling would erase that.
  if (!ticket || ticket.status === "cancelled" || ticket.checked_in_at)
    return [];

  await db
    .prepare(
      "UPDATE registrations SET status = 'cancelled', cancelled_at = ?, share_id = NULL WHERE id = ?",
    )
    .bind(now, token)
    .run();
  return ticket.status === "going" ? fillSeats(db, event) : [];
}

/**
 * Gives every free seat to the waitlist, oldest first. Returns the tokens of
 * the tickets that got a seat.
 */
export async function fillSeats(
  db: D1Database,
  event: EventMeta,
): Promise<string[]> {
  // SQLite reads LIMIT -1 as no limit: an event without capacity seats all.
  let free = -1;
  if (event.capacity !== undefined) {
    free = event.capacity - (await goingCount(db, event.slug));
    if (free <= 0) return [];
  }

  const { results } = await db
    .prepare(
      `UPDATE registrations SET status = 'going'
       WHERE id IN (SELECT id FROM registrations WHERE event_slug = ? AND status = 'waitlist'
                    ORDER BY created_at, number LIMIT ?)
       RETURNING id`,
    )
    .bind(event.slug, free)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

/**
 * Claims the right to resend a ticket's link: true at most once per
 * `cooldownMs`, so repeat posts of one email send one message.
 */
export async function claimResend(
  db: D1Database,
  token: string,
  now: Date,
  cooldownMs = RESEND_COOLDOWN,
): Promise<boolean> {
  const since = new Date(now.getTime() - cooldownMs).toISOString();
  const result = await db
    .prepare(
      `UPDATE registrations SET resent_at = ?1
       WHERE id = ?2 AND (resent_at IS NULL OR resent_at <= ?3)`,
    )
    .bind(now.toISOString(), token, since)
    .run();
  return result.meta.changes > 0;
}

/**
 * Seated tickets of the event that have had no reminder and were taken
 * before `before`: a ticket taken inside the last day already got its
 * confirmation.
 */
export async function unreminded(
  db: D1Database,
  slug: string,
  before: Date,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT id, created_at AS createdAt FROM registrations
       WHERE event_slug = ? AND status = 'going' AND reminded_at IS NULL`,
    )
    .bind(slug)
    .all<{ id: string; createdAt: string }>();
  return results
    .filter((row) => new Date(row.createdAt) <= before)
    .map((row) => row.id);
}

export async function markReminded(
  db: D1Database,
  token: string,
  now: string,
): Promise<void> {
  await db
    .prepare("UPDATE registrations SET reminded_at = ? WHERE id = ?")
    .bind(now, token)
    .run();
}
