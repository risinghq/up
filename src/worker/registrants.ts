import { sql } from "kysely";
import type { Db } from "./db";
import type { Status } from "./registrations";

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

const count = sql<number>`count(*)`.as("n");

/** Registrations of every status. An event with any keeps its slug. */
export async function registrationCount(db: Db, slug: string): Promise<number> {
  const row = await db
    .selectFrom("registrations")
    .select(count)
    .where("event_slug", "=", slug)
    .executeTakeFirst();
  return row?.n ?? 0;
}

/** Registrations of the event by status. */
export async function statusCounts(
  db: Db,
  slug: string,
): Promise<Record<Status, number>> {
  const rows = await db
    .selectFrom("registrations")
    .select(["status", count])
    .where("event_slug", "=", slug)
    .groupBy("status")
    .execute();

  const counts = { going: 0, waitlist: 0, cancelled: 0 };
  for (const row of rows) counts[row.status] = row.n;
  return counts;
}

/** How many of the event's people have come in. */
export async function checkedInCount(db: Db, slug: string): Promise<number> {
  const row = await db
    .selectFrom("registrations")
    .select(count)
    .where("event_slug", "=", slug)
    .where("checked_in_at", "is not", null)
    .executeTakeFirst();
  return row?.n ?? 0;
}

export async function listRegistrants(
  db: Db,
  slug: string,
): Promise<Registrant[]> {
  const rows = await db
    .selectFrom("registrations as r")
    .innerJoin("people as p", "p.id", "r.person_id")
    .select([
      "r.id as token",
      "r.number",
      "r.status",
      "p.name",
      "p.email",
      "p.phone",
      "p.news_opt_in_at",
      "r.answers",
      "r.created_at as createdAt",
      "r.checked_in_at as checkedInAt",
    ])
    .where("r.event_slug", "=", slug)
    .orderBy("r.number")
    // A registration's person was stored with the form's email and phone.
    .$narrowType<{ email: string; phone: string }>()
    .execute();

  return rows.map(({ news_opt_in_at, answers, ...r }) => ({
    ...r,
    newsOptIn: news_opt_in_at !== null,
    answers: JSON.parse(answers),
  }));
}
