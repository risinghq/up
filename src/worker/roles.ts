import { newToken } from "./tokens";

export const roles = [
  "organiza",
  "ponente",
  "mentor",
  "jurado",
  "voluntario",
] as const;

export type Role = (typeof roles)[number];

export const isRole = (value: string): value is Role =>
  (roles as readonly string[]).includes(value);

/** The roles whose holders work the event's door. */
export const doorRoles: readonly Role[] = ["organiza", "voluntario"];

/** A role for one person, and for the people who hold it at an event. */
export const roleLabel: Record<Role, { one: string; many: string }> = {
  organiza: { one: "Organiza", many: "Organizan" },
  ponente: { one: "Ponente", many: "Ponentes" },
  mentor: { one: "Mentor", many: "Mentores" },
  jurado: { one: "Jurado", many: "Jurado" },
  voluntario: { one: "Voluntario", many: "Voluntarios" },
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
export async function eventRoles(
  db: D1Database,
  slug: string,
): Promise<EventRole[]> {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.event_slug AS eventSlug, r.person_id AS personId, p.name, p.email,
              p.profile_id AS profileId, r.role, r.certificate_id AS certificateId
       FROM event_roles r JOIN people p ON p.id = r.person_id
       WHERE r.event_slug = ? ORDER BY r.position`,
    )
    .bind(slug)
    .all<EventRole>();

  return results.sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role));
}

export type RoleChange = "added" | "exists" | "unknown";

/** Gives the person a role at the event, unless they already hold it. */
export async function addRole(
  db: D1Database,
  slug: string,
  personId: string,
  role: Role,
): Promise<RoleChange> {
  const person = await db
    .prepare("SELECT 1 FROM people WHERE id = ?")
    .bind(personId)
    .first();
  if (!person) return "unknown";

  const row = await db
    .prepare(
      `INSERT INTO event_roles (event_slug, person_id, role, position, certificate_id)
       SELECT ?1, ?2, ?3, COALESCE(MAX(position), -1) + 1, ?4
       FROM event_roles WHERE event_slug = ?1
       ON CONFLICT DO NOTHING
       RETURNING id`,
    )
    .bind(slug, personId, role, newToken())
    .first();

  return row ? "added" : "exists";
}

export async function removeRole(
  db: D1Database,
  slug: string,
  id: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM event_roles WHERE event_slug = ? AND id = ?")
    .bind(slug, id)
    .run();
}

/** Whether the person organizes or volunteers at the event. */
export async function holdsDoor(
  db: D1Database,
  slug: string,
  personId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM event_roles
       WHERE event_slug = ? AND person_id = ?
         AND role IN (SELECT value FROM json_each(?))`,
    )
    .bind(slug, personId, JSON.stringify(doorRoles))
    .first();
  return Boolean(row);
}

/** Every role the person holds at a published event. */
export async function rolesOf(
  db: D1Database,
  personId: string,
): Promise<{ slug: string; role: Role }[]> {
  const { results } = await db
    .prepare(
      `SELECT r.event_slug AS slug, r.role FROM event_roles r
       JOIN events e ON e.slug = r.event_slug
       WHERE e.status = 'published' AND r.person_id = ?`,
    )
    .bind(personId)
    .all<{ slug: string; role: Role }>();

  return results;
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
  db: D1Database,
  personId: string,
  now: Date,
): Promise<AccountRole[]> {
  const { results } = await db
    .prepare(
      `SELECT e.slug, e.title, e.start_at AS start, e.end_at AS end, r.role,
              r.certificate_id AS certificateId
       FROM event_roles r JOIN events e ON e.slug = r.event_slug
       WHERE r.person_id = ? AND e.status = 'published'`,
    )
    .bind(personId)
    .all<Omit<AccountRole, "past"> & { end: string }>();

  const held = results.map(({ end, ...r }) => ({
    ...r,
    past: new Date(end) <= now,
  }));
  const time = (r: AccountRole) => new Date(r.start).getTime();

  return [
    ...held.filter((r) => !r.past).sort((a, b) => time(a) - time(b)),
    ...held.filter((r) => r.past).sort((a, b) => time(b) - time(a)),
  ];
}
