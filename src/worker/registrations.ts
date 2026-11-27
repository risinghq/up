import { sql } from "kysely";
import type { Db } from "./db";
import type { EventMeta } from "./events";
import type { Registration } from "./form";
import { upsertPerson } from "./people";
import { newToken } from "./tokens";

export type Status = "going" | "waitlist" | "cancelled";

export type Ticket = {
  token: string;
  personId: string;
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
  /** The public share link's id, once the holder shared the ticket. */
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

const counted = (db: Db, slug: string) =>
  db
    .selectFrom("registrations")
    .select(sql<number>`count(*)`.as("n"))
    .where("event_slug", "=", slug)
    .where("status", "=", "going");

/**
 * The status a new or revived registration takes, decided in the statement
 * that writes it, so two registrations at once cannot both take the last seat.
 */
function seatOrWaitlist(db: Db, event: EventMeta) {
  if (event.capacity === undefined) return sql<"going">`'going'`;

  return sql<
    "going" | "waitlist"
  >`CASE WHEN ${counted(db, event.slug)} < ${event.capacity}
    THEN 'going' ELSE 'waitlist' END`;
}

export async function goingCount(db: Db, slug: string): Promise<number> {
  const row = await counted(db, slug).executeTakeFirst();
  return row?.n ?? 0;
}

/**
 * Registers a person for an event. An email already holding a live ticket
 * gets `exists` with that ticket's token, which the caller mails to the
 * address and never shows, so typing someone's email does not open their
 * ticket. A cancelled ticket comes back to life under a new token.
 */
export async function register(
  db: Db,
  event: EventMeta,
  r: Registration,
  now: string,
  proven = false,
): Promise<RegisterResult> {
  const personId = await upsertPerson(db, r, now, proven);
  const existing = await db
    .selectFrom("registrations")
    .select(["id", "status"])
    .where("event_slug", "=", event.slug)
    .where("person_id", "=", personId)
    .executeTakeFirst();
  if (existing && existing.status !== "cancelled")
    return { kind: "exists", token: existing.id };

  const token = newToken();
  const answers = JSON.stringify(r.answers);
  const status = seatOrWaitlist(db, event);

  // The number, like the status, is taken in the statement that writes.
  const write = existing
    ? db
        .updateTable("registrations")
        .set({
          id: token,
          status,
          answers,
          created_at: now,
          cancelled_at: null,
          checked_in_at: null,
          share_id: null,
        })
        .where("id", "=", existing.id)
        .returning("status")
    : db
        .insertInto("registrations")
        .values({
          id: token,
          event_slug: event.slug,
          person_id: personId,
          number: db
            .selectFrom("registrations")
            .select(sql<number>`coalesce(max(number), 0) + 1`.as("next"))
            .where("event_slug", "=", event.slug),
          status,
          answers,
          created_at: now,
        })
        .returning("status");

  const row = await write.executeTakeFirstOrThrow();

  return {
    kind: "created",
    token,
    status: row.status === "going" ? "going" : "waitlist",
  };
}

export async function findTicket(
  db: Db,
  token: string,
): Promise<Ticket | null> {
  const row = await db
    .selectFrom("registrations as r")
    .innerJoin("people as p", "p.id", "r.person_id")
    .select([
      "r.id as token",
      "r.person_id as personId",
      "r.event_slug as eventSlug",
      "r.number",
      "r.status",
      "p.name",
      "p.email",
      "p.phone",
      "r.created_at as createdAt",
      "r.checked_in_at as checkedInAt",
      "r.share_id as shareId",
      "p.profile_id as profileId",
      "r.certificate_id as certificateId",
    ])
    .where("r.id", "=", token)
    // A registration's person was stored with the form's email and phone.
    .$narrowType<{ email: string; phone: string }>()
    .executeTakeFirst();
  return row ?? null;
}

/**
 * Records that the ticket's holder came in, and gives the ticket its
 * certificate id once. A cancelled ticket cannot, and a second check-in keeps
 * the first time.
 */
export async function checkIn(db: Db, token: string, now: string) {
  await db
    .updateTable("registrations")
    .set({
      checked_in_at: now,
      certificate_id: sql`coalesce(certificate_id, ${newToken()})`,
    })
    .where("id", "=", token)
    .where("status", "!=", "cancelled")
    .where("checked_in_at", "is", null)
    .execute();
}

/**
 * Registers a person who came to the door and checks them in. They take a
 * seat past the capacity: the door already let them in. A person who was
 * registered keeps their ticket and is checked in on it.
 */
export async function walkIn(
  db: Db,
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

export async function undoCheckIn(db: Db, token: string) {
  await db
    .updateTable("registrations")
    .set({ checked_in_at: null })
    .where("id", "=", token)
    .execute();
}

/**
 * Cancels a ticket. A freed seat goes to the oldest waitlisted registration;
 * returns the tokens of the tickets that got a seat.
 */
export async function cancel(
  db: Db,
  event: EventMeta,
  token: string,
  now: string,
): Promise<string[]> {
  const ticket = await db
    .selectFrom("registrations")
    .select(["status", "checked_in_at"])
    .where("id", "=", token)
    .where("event_slug", "=", event.slug)
    .executeTakeFirst();
  // A person already let in has attended; cancelling would erase that.
  if (!ticket || ticket.status === "cancelled" || ticket.checked_in_at)
    return [];

  await db
    .updateTable("registrations")
    .set({ status: "cancelled", cancelled_at: now, share_id: null })
    .where("id", "=", token)
    .execute();
  return ticket.status === "going" ? fillSeats(db, event) : [];
}

/**
 * Gives every free seat to the waitlist, oldest first. Returns the tokens of
 * the tickets that got a seat.
 */
export async function fillSeats(db: Db, event: EventMeta): Promise<string[]> {
  let waiting = db
    .selectFrom("registrations")
    .select("id")
    .where("event_slug", "=", event.slug)
    .where("status", "=", "waitlist")
    .orderBy("created_at")
    .orderBy("number");

  if (event.capacity !== undefined) {
    const free = event.capacity - (await goingCount(db, event.slug));
    if (free <= 0) return [];
    waiting = waiting.limit(free);
  }

  const rows = await db
    .updateTable("registrations")
    .set({ status: "going" })
    .where("id", "in", waiting)
    .returning("id")
    .execute();
  return rows.map((row) => row.id);
}

/**
 * Claims the right to resend a ticket's link: true at most once per
 * `cooldownMs`, so repeat posts of one email send one message.
 */
export async function claimResend(
  db: Db,
  token: string,
  now: Date,
  cooldownMs = RESEND_COOLDOWN,
): Promise<boolean> {
  const since = new Date(now.getTime() - cooldownMs).toISOString();
  const row = await db
    .updateTable("registrations")
    .set({ resent_at: now.toISOString() })
    .where("id", "=", token)
    .where((eb) =>
      eb.or([eb("resent_at", "is", null), eb("resent_at", "<=", since)]),
    )
    .returning("id")
    .executeTakeFirst();
  return Boolean(row);
}

/**
 * Seated tickets of the event that have had no reminder and were taken
 * before `before`: a ticket taken inside the last day already got its
 * confirmation.
 */
export async function unreminded(
  db: Db,
  slug: string,
  before: Date,
): Promise<string[]> {
  const rows = await db
    .selectFrom("registrations")
    .select(["id", "created_at"])
    .where("event_slug", "=", slug)
    .where("status", "=", "going")
    .where("reminded_at", "is", null)
    .execute();
  return rows
    .filter((row) => new Date(row.created_at) <= before)
    .map((row) => row.id);
}

export async function markReminded(db: Db, token: string, now: string) {
  await db
    .updateTable("registrations")
    .set({ reminded_at: now })
    .where("id", "=", token)
    .execute();
}

/** A ticket as the account page lists it. */
export type AccountTicket = {
  token: string;
  slug: string;
  title: string;
  start: string;
  status: "going" | "waitlist";
  past: boolean;
};

/** The person's live tickets: the next event first, then the ended ones, latest first. */
export async function ticketsOf(
  db: Db,
  personId: string,
  now: Date,
): Promise<AccountTicket[]> {
  const rows = await db
    .selectFrom("registrations as r")
    .innerJoin("events as e", "e.slug", "r.event_slug")
    .select([
      "r.id as token",
      "e.slug",
      "e.title",
      "e.start_at as start",
      "e.end_at as end",
      "r.status",
    ])
    .where("r.person_id", "=", personId)
    .where("r.status", "!=", "cancelled")
    .$narrowType<{ status: "going" | "waitlist" }>()
    .execute();

  const tickets = rows.map(({ end, ...t }) => ({
    ...t,
    past: new Date(end) <= now,
  }));
  const time = (t: AccountTicket) => new Date(t.start).getTime();

  return [
    ...tickets.filter((t) => !t.past).sort((a, b) => time(a) - time(b)),
    ...tickets.filter((t) => t.past).sort((a, b) => time(b) - time(a)),
  ];
}
