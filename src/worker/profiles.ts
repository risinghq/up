import { firstName } from "./people";
import { rolesOf, type Role } from "./roles";
import { newToken } from "./tokens";

export type Profile = {
  firstName: string;
  /** When the person first registered. */
  since: string;
  /** The slugs of the published events the person checked in at. */
  attended: string[];
  /** The person's roles at published events. */
  roles: { slug: string; role: Role }[];
};

/** Opens the person's public profile; a second call keeps its link. */
export async function openProfile(
  db: D1Database,
  personId: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE people SET profile_id = COALESCE(profile_id, ?) WHERE id = ?",
    )
    .bind(newToken(), personId)
    .run();
}

/** Hides the person's profile; its link stops working. */
export async function closeProfile(
  db: D1Database,
  personId: string,
): Promise<void> {
  await db
    .prepare("UPDATE people SET profile_id = NULL WHERE id = ?")
    .bind(personId)
    .run();
}

/** The person's profile id, or null while the profile is hidden. */
export async function profileIdOf(
  db: D1Database,
  personId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT profile_id AS profileId FROM people WHERE id = ?")
    .bind(personId)
    .first<{ profileId: string | null }>();
  return row?.profileId ?? null;
}

/** What a profile shows: the first name, the events attended, the roles. */
export async function findProfile(
  db: D1Database,
  profileId: string,
): Promise<Profile | null> {
  const person = await db
    .prepare("SELECT id, name, created_at FROM people WHERE profile_id = ?")
    .bind(profileId)
    .first<{
      id: string;
      name: string;
      created_at: string;
    }>();
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
    roles: await rolesOf(db, person.id),
  };
}
