import { hashToken, newToken } from "./tokens";

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
  name: string;
  /** Ties the event to the person's profile; never shown. */
  email: string | null;
  role: Role;
  /** True when the person holds a live door link. */
  door: boolean;
};

export type NewRole = Pick<EventRole, "name" | "email" | "role">;

type Row = {
  id: number;
  event_slug: string;
  name: string;
  email: string | null;
  role: Role;
  door: number;
};

const fromRow = (r: Row): EventRole => ({
  id: r.id,
  eventSlug: r.event_slug,
  name: r.name,
  email: r.email,
  role: r.role,
  door: Boolean(r.door),
});

/** The event's people, grouped in the order of `roles`, each group as added. */
export async function eventRoles(
  db: D1Database,
  slug: string,
): Promise<EventRole[]> {
  const { results } = await db
    .prepare(
      `SELECT id, event_slug, name, email, role, door_hash IS NOT NULL AS door FROM event_roles
       WHERE event_slug = ? ORDER BY position`,
    )
    .bind(slug)
    .all<Row>();

  return results
    .map(fromRow)
    .sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role));
}

/** Gives a person a role at the event, unless their email already holds it. */
export async function addRole(
  db: D1Database,
  slug: string,
  role: NewRole,
): Promise<"added" | "exists"> {
  const row = await db
    .prepare(
      `INSERT INTO event_roles (event_slug, name, email, role, position)
       SELECT ?1, ?2, ?3, ?4, COALESCE(MAX(position), -1) + 1
       FROM event_roles WHERE event_slug = ?1
       ON CONFLICT DO NOTHING
       RETURNING id`,
    )
    .bind(slug, role.name, role.email, role.role)
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

/**
 * Gives a voluntario a new door link and returns its token, or null when
 * the id is not a voluntario of the event. The previous link stops working.
 */
export async function openDoor(
  db: D1Database,
  slug: string,
  id: number,
): Promise<string | null> {
  const token = newToken();
  const row = await db
    .prepare(
      `UPDATE event_roles SET door_hash = ?
       WHERE event_slug = ? AND id = ? AND role = 'voluntario'
       RETURNING id`,
    )
    .bind(await hashToken(token), slug, id)
    .first();

  return row ? token : null;
}

/** The slug of the event a door token opens, while its role exists. */
export async function doorEvent(
  db: D1Database,
  token: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT event_slug FROM event_roles WHERE door_hash = ?")
    .bind(await hashToken(token))
    .first<{ event_slug: string }>();

  return row?.event_slug ?? null;
}

/** Every role this email holds at a published event. */
export async function rolesOf(
  db: D1Database,
  email: string,
): Promise<{ slug: string; role: Role }[]> {
  const { results } = await db
    .prepare(
      `SELECT r.event_slug AS slug, r.role FROM event_roles r
       JOIN events e ON e.slug = r.event_slug
       WHERE e.status = 'published' AND r.email = ?`,
    )
    .bind(email)
    .all<{ slug: string; role: Role }>();

  return results;
}
