import { firstName } from "./people";
import { newToken } from "./tokens";

export type Profile = {
  firstName: string;
  /** When the person first registered. */
  since: string;
  /** The slugs of the published events the person checked in at. */
  attended: string[];
  /** The slugs of the published events that list the person as a host. */
  hosted: string[];
};

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

/** The slugs of the published events that list this email as a host's. */
export async function hostedSlugs(
  db: D1Database,
  email: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT e.slug FROM events e, json_each(e.hosts) h
       WHERE e.status = 'published' AND json_extract(h.value, '$.email') = ?`,
    )
    .bind(email)
    .all<{ slug: string }>();
  return results.map((r) => r.slug);
}

/** The public profile of each email that has one, by email. */
export async function profilesByEmail(
  db: D1Database,
  emails: string[],
): Promise<Map<string, string>> {
  if (!emails.length) return new Map();

  const { results } = await db
    .prepare(
      `SELECT email, profile_id AS profileId FROM people
       WHERE profile_id IS NOT NULL
         AND email IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(emails))
    .all<{ email: string; profileId: string }>();
  return new Map(results.map((r) => [r.email, r.profileId]));
}

/** What a profile shows: the first name and the events attended and hosted. */
export async function findProfile(
  db: D1Database,
  profileId: string,
): Promise<Profile | null> {
  const person = await db
    .prepare(
      "SELECT id, name, email, created_at FROM people WHERE profile_id = ?",
    )
    .bind(profileId)
    .first<{ id: string; name: string; email: string; created_at: string }>();
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
    since: person.created_at,
    attended: results.map((r) => r.slug),
    hosted: await hostedSlugs(db, person.email),
  };
}
