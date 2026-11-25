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

type RegistrantRow = Omit<Registrant, "answers" | "newsOptIn"> & {
  answers: string;
  newsOptIn: number;
};

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
