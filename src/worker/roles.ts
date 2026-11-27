import { sql } from "kysely";
import type { Db } from "./db";
import { newToken } from "./tokens";

export const roles = [
  "organizer",
  "speaker",
  "mentor",
  "judge",
  "volunteer",
] as const;

export type Role = (typeof roles)[number];

export const isRole = (value: string): value is Role =>
  (roles as readonly string[]).includes(value);

/** The roles whose holders work the event's door. */
export const doorRoles: readonly Role[] = ["organizer", "volunteer"];

/** A role for one person, and for the people who hold it at an event. */
export const roleLabel: Record<Role, { one: string; many: string }> = {
  organizer: { one: "Organiza", many: "Organizan" },
  speaker: { one: "Ponente", many: "Ponentes" },
  mentor: { one: "Mentor", many: "Mentores" },
  judge: { one: "Jurado", many: "Jurado" },
  volunteer: { one: "Voluntario", many: "Voluntarios" },
};

/** One person's part in one event. */
export type EventRole = {
  id: number;
  eventSlug: string;
  personId: string;
  name: string;
  /** Shown to admins only. */
  email: string | null;
  /** The person's public profile id, while it is open. */
  profileId: string | null;
  role: Role;
  /** The id of the role's certificate at /c/<id>. */
  certificateId: string;
};

/** The event's people, grouped in the order of `roles`, each group as added. */
export async function eventRoles(db: Db, slug: string): Promise<EventRole[]> {
  const rows = await db
    .selectFrom("event_roles as r")
    .innerJoin("people as p", "p.id", "r.person_id")
    .select([
      "r.id",
      "r.event_slug as eventSlug",
      "r.person_id as personId",
      "p.name",
      "p.email",
      "p.profile_id as profileId",
      "r.role",
      "r.certificate_id as certificateId",
    ])
    .where("r.event_slug", "=", slug)
    .orderBy("r.position")
    .execute();

  return rows.sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role));
}

export type RoleChange = "added" | "exists" | "unknown";

/** Gives the person a role at the event, unless they already hold it. */
export async function addRole(
  db: Db,
  slug: string,
  personId: string,
  role: Role,
): Promise<RoleChange> {
  const person = await db
    .selectFrom("people")
    .select("id")
    .where("id", "=", personId)
    .executeTakeFirst();
  if (!person) return "unknown";

  // The position is read in the statement that inserts, so two adds at once
  // cannot take the same one.
  const row = await db
    .insertInto("event_roles")
    .values({
      event_slug: slug,
      person_id: personId,
      role,
      position: db
        .selectFrom("event_roles")
        .select(sql<number>`coalesce(max(position), -1) + 1`.as("next"))
        .where("event_slug", "=", slug),
      certificate_id: newToken(),
    })
    .onConflict((oc) => oc.doNothing())
    .returning("id")
    .executeTakeFirst();

  return row ? "added" : "exists";
}

export async function removeRole(
  db: Db,
  slug: string,
  id: number,
): Promise<void> {
  await db
    .deleteFrom("event_roles")
    .where("event_slug", "=", slug)
    .where("id", "=", id)
    .execute();
}

/** Whether the person organizes or volunteers at the event. */
export async function holdsDoor(
  db: Db,
  slug: string,
  personId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("event_roles")
    .select("id")
    .where("event_slug", "=", slug)
    .where("person_id", "=", personId)
    .where("role", "in", doorRoles)
    .executeTakeFirst();
  return Boolean(row);
}

/** Every role the person holds at a published event. */
export async function rolesOf(
  db: Db,
  personId: string,
): Promise<{ slug: string; role: Role }[]> {
  return db
    .selectFrom("event_roles as r")
    .innerJoin("events as e", "e.slug", "r.event_slug")
    .select(["r.event_slug as slug", "r.role"])
    .where("e.status", "=", "published")
    .where("r.person_id", "=", personId)
    .execute();
}

/** A role on the person's account page. */
export type AccountRole = {
  slug: string;
  title: string;
  start: string;
  role: Role;
  certificateId: string;
  past: boolean;
};

/** The person's roles at published events, upcoming first, then the latest past. */
export async function accountRoles(
  db: Db,
  personId: string,
  now: Date,
): Promise<AccountRole[]> {
  const rows = await db
    .selectFrom("event_roles as r")
    .innerJoin("events as e", "e.slug", "r.event_slug")
    .select([
      "e.slug",
      "e.title",
      "e.start_at as start",
      "e.end_at as end",
      "r.role",
      "r.certificate_id as certificateId",
    ])
    .where("r.person_id", "=", personId)
    .where("e.status", "=", "published")
    .execute();

  const held = rows.map(({ end, ...r }) => ({
    ...r,
    past: new Date(end) <= now,
  }));
  const time = (r: AccountRole) => new Date(r.start).getTime();

  return [
    ...held.filter((r) => !r.past).sort((a, b) => time(a) - time(b)),
    ...held.filter((r) => r.past).sort((a, b) => time(b) - time(a)),
  ];
}
