import type { EventMeta } from "../events/types";
import type { Registration } from "./form";

export type Status = "going" | "waitlist" | "cancelled";

export type Ticket = {
  token: string;
  eventSlug: string;
  number: number;
  status: Status;
  name: string;
  createdAt: string;
};

export type RegisterResult =
  | { kind: "created"; token: string; status: Status }
  | { kind: "exists" };

/** A ticket token: 128 random bits, base64url. It is the registrant's only key. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

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
 * gets `exists` and no token, so typing someone's email does not open their
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
  if (existing && existing.status !== "cancelled") return { kind: "exists" };

  const full =
    event.capacity !== undefined &&
    (await goingCount(db, event.slug)) >= event.capacity;
  const status: Status = full ? "waitlist" : "going";
  const token = newToken();
  const answers = JSON.stringify(r.answers);

  if (existing) {
    await db
      .prepare(
        `UPDATE registrations SET id = ?, status = ?, answers = ?, created_at = ?, cancelled_at = NULL
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
      `SELECT r.id AS token, r.event_slug AS eventSlug, r.number, r.status, p.name, r.created_at AS createdAt
       FROM registrations r JOIN people p ON p.id = r.person_id
       WHERE r.id = ?`,
    )
    .bind(token)
    .first<Ticket>();
}

/** Cancels a ticket. A freed seat goes to the oldest waitlisted registration. */
export async function cancel(
  db: D1Database,
  event: EventMeta,
  token: string,
  now = new Date().toISOString(),
): Promise<void> {
  const ticket = await db
    .prepare("SELECT status FROM registrations WHERE id = ? AND event_slug = ?")
    .bind(token, event.slug)
    .first<{ status: Status }>();
  if (!ticket || ticket.status === "cancelled") return;

  await db
    .prepare(
      "UPDATE registrations SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
    )
    .bind(now, token)
    .run();
  if (ticket.status !== "going") return;
  if (
    event.capacity !== undefined &&
    (await goingCount(db, event.slug)) >= event.capacity
  )
    return;
  await db
    .prepare(
      `UPDATE registrations SET status = 'going'
       WHERE id = (SELECT id FROM registrations WHERE event_slug = ? AND status = 'waitlist'
                   ORDER BY created_at, number LIMIT 1)`,
    )
    .bind(event.slug)
    .run();
}
