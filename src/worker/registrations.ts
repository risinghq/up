import type { EventMeta } from "./events";
import type { Registration } from "./form";
import { newToken } from "./tokens";

export type Status = "going" | "waitlist" | "cancelled";

export type Ticket = {
  token: string;
  eventSlug: string;
  number: number;
  status: Status;
  name: string;
  email: string;
  createdAt: string;
  /** When an admin let the person in at the door. */
  checkedInAt: string | null;
  /** The public "voy" link's id, once the holder shared the ticket. */
  shareId: string | null;
  /** The holder's public profile id, once they opened it. */
  profileId: string | null;
};

export type RegisterResult =
  | { kind: "created"; token: string; status: "going" | "waitlist" }
  | { kind: "exists"; token: string };

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

async function upsertPerson(
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
  now = new Date().toISOString(),
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

  const full =
    event.capacity !== undefined &&
    (await goingCount(db, event.slug)) >= event.capacity;
  const status = full ? "waitlist" : "going";
  const token = newToken();
  const answers = JSON.stringify(r.answers);

  if (existing) {
    await db
      .prepare(
        `UPDATE registrations SET id = ?, status = ?, answers = ?, created_at = ?, cancelled_at = NULL, checked_in_at = NULL, share_id = NULL
         WHERE id = ?`,
      )
      .bind(token, status, answers, now, existing.id)
      .run();
  } else {
    // The number is taken in the same statement that inserts, so two
    // registrations at once cannot share one.
    await db
      .prepare(
        `INSERT INTO registrations (id, event_slug, person_id, number, status, answers, created_at)
         SELECT ?1, ?2, ?3, COALESCE(MAX(number), 0) + 1, ?4, ?5, ?6
         FROM registrations WHERE event_slug = ?2`,
      )
      .bind(token, event.slug, personId, status, answers, now)
      .run();
  }
  return { kind: "created", token, status };
}

export async function findTicket(
  db: D1Database,
  token: string,
): Promise<Ticket | null> {
  return db
    .prepare(
      `SELECT r.id AS token, r.event_slug AS eventSlug, r.number, r.status, p.name, p.email,
              r.created_at AS createdAt, r.checked_in_at AS checkedInAt, r.share_id AS shareId,
              p.profile_id AS profileId
       FROM registrations r JOIN people p ON p.id = r.person_id
       WHERE r.id = ?`,
    )
    .bind(token)
    .first<Ticket>();
}

/**
 * Records that the ticket's holder came in. A cancelled ticket cannot, and a
 * second check-in keeps the first time.
 */
export async function checkIn(
  db: D1Database,
  token: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE registrations SET checked_in_at = ?
       WHERE id = ? AND status != 'cancelled' AND checked_in_at IS NULL`,
    )
    .bind(now, token)
    .run();
}

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

export type Share = { eventSlug: string; firstName: string };

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

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Opens the public profile of the ticket's holder; a second call keeps it. */
export async function openProfile(
  db: D1Database,
  token: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE people SET profile_id = COALESCE(profile_id, ?)
       WHERE id = (SELECT person_id FROM registrations WHERE id = ?)`,
    )
    .bind(newToken(), token)
    .run();
}

/** Hides the holder's profile; its link stops working. */
export async function closeProfile(
  db: D1Database,
  token: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE people SET profile_id = NULL
       WHERE id = (SELECT person_id FROM registrations WHERE id = ?)`,
    )
    .bind(token)
    .run();
}

export type Profile = {
  firstName: string;
  /** The slugs of the published events the person checked in at. */
  attended: string[];
};

/** What a profile shows: the first name and the slugs of attended events. */
export async function findProfile(
  db: D1Database,
  profileId: string,
): Promise<Profile | null> {
  const person = await db
    .prepare("SELECT id, name FROM people WHERE profile_id = ?")
    .bind(profileId)
    .first<{ id: string; name: string }>();
  if (!person) return null;

  const { results } = await db
    .prepare(
      `SELECT r.event_slug AS slug
       FROM registrations r JOIN events e ON e.slug = r.event_slug
       WHERE r.person_id = ? AND r.checked_in_at IS NOT NULL
         AND e.status = 'published'`,
    )
    .bind(person.id)
    .all<{ slug: string }>();
  return {
    firstName: firstName(person.name),
    attended: results.map((r) => r.slug),
  };
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
  now = new Date().toISOString(),
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
  cooldownMs: number,
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

/** Registrations of every status. An event with any keeps its slug. */
export async function registrationCount(
  db: D1Database,
  slug: string,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM registrations WHERE event_slug = ?")
    .bind(slug)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Registrations of the event by status. */
export async function statusCounts(
  db: D1Database,
  slug: string,
): Promise<Record<Status, number>> {
  const { results } = await db
    .prepare(
      "SELECT status, COUNT(*) AS n FROM registrations WHERE event_slug = ? GROUP BY status",
    )
    .bind(slug)
    .all<{ status: Status; n: number }>();
  const counts = { going: 0, waitlist: 0, cancelled: 0 };
  for (const row of results) counts[row.status] = row.n;
  return counts;
}

export type Registrant = {
  token: string;
  number: number;
  status: Status;
  name: string;
  email: string;
  phone: string;
  newsOptIn: boolean;
  answers: Record<string, string>;
  createdAt: string;
  checkedInAt: string | null;
};

type RegistrantRow = Omit<Registrant, "answers" | "newsOptIn"> & {
  answers: string;
  newsOptIn: number;
};

export async function listRegistrants(
  db: D1Database,
  slug: string,
): Promise<Registrant[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id AS token, r.number, r.status, p.name, p.email, p.phone,
              p.news_opt_in_at IS NOT NULL AS newsOptIn, r.answers,
              r.created_at AS createdAt, r.checked_in_at AS checkedInAt
       FROM registrations r JOIN people p ON p.id = r.person_id
       WHERE r.event_slug = ? ORDER BY r.number`,
    )
    .bind(slug)
    .all<RegistrantRow>();
  return results.map((r) => ({
    ...r,
    newsOptIn: r.newsOptIn === 1,
    answers: JSON.parse(r.answers),
  }));
}
