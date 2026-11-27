import { sql } from "kysely";
import type { Db } from "./db";
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
export async function openProfile(db: Db, personId: string) {
  await db
    .updateTable("people")
    .set({ profile_id: sql`coalesce(profile_id, ${newToken()})` })
    .where("id", "=", personId)
    .execute();
}

/** Hides the person's profile; its link stops working. */
export async function closeProfile(db: Db, personId: string) {
  await db
    .updateTable("people")
    .set({ profile_id: null })
    .where("id", "=", personId)
    .execute();
}

/** The person's profile id, or null while the profile is hidden. */
export async function profileIdOf(
  db: Db,
  personId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("people")
    .select("profile_id")
    .where("id", "=", personId)
    .executeTakeFirst();
  return row?.profile_id ?? null;
}

/** What a profile shows: the first name, the events attended, the roles. */
export async function findProfile(
  db: Db,
  profileId: string,
): Promise<Profile | null> {
  const person = await db
    .selectFrom("people")
    .select(["id", "name", "created_at"])
    .where("profile_id", "=", profileId)
    .executeTakeFirst();
  if (!person) return null;

  const attended = await db
    .selectFrom("registrations as r")
    .innerJoin("events as e", "e.slug", "r.event_slug")
    .select("r.event_slug as slug")
    .where("r.person_id", "=", person.id)
    .where("r.checked_in_at", "is not", null)
    .where("e.status", "=", "published")
    .execute();

  return {
    firstName: firstName(person.name),
    since: person.created_at,
    attended: attended.map((r) => r.slug),
    roles: await rolesOf(db, person.id),
  };
}
