import { hasEnded, type EventMeta } from "./events";
import { roles, type Role } from "./roles";

/** A certificate at /c/<id>: a checked-in ticket's or a role's. */
export type Certificate = {
  id: string;
  eventSlug: string;
  /** The holder's full name. */
  name: string;
  /** The part the person had; null for a person who attended. */
  role: Role | null;
};

/** An event gives certificates once it is published and over. */
export const issuesCertificates = (event: EventMeta, now: Date) =>
  event.status === "published" && hasEnded(event, now);

const firstRole = (held: Role[]): Role | null =>
  roles.find((role) => held.includes(role)) ?? null;

/**
 * Finds a certificate by id. A ticket's names the role its holder has at the
 * event, the first in the order of `roles`, so a mentor who also
 * registered reads as a mentor.
 */
export async function findCertificate(
  db: D1Database,
  id: string,
): Promise<Certificate | null> {
  const ticket = await db
    .prepare(
      `SELECT r.event_slug AS eventSlug, r.person_id AS personId, p.name FROM registrations r
       JOIN people p ON p.id = r.person_id
       WHERE r.certificate_id = ? AND r.checked_in_at IS NOT NULL`,
    )
    .bind(id)
    .first<{ eventSlug: string; personId: string; name: string }>();

  if (ticket) {
    const { results } = await db
      .prepare(
        "SELECT role FROM event_roles WHERE event_slug = ? AND person_id = ?",
      )
      .bind(ticket.eventSlug, ticket.personId)
      .all<{ role: Role }>();

    return {
      id,
      eventSlug: ticket.eventSlug,
      name: ticket.name,
      role: firstRole(results.map((row) => row.role)),
    };
  }

  const role = await db
    .prepare(
      `SELECT r.event_slug AS eventSlug, p.name, r.role FROM event_roles r
       JOIN people p ON p.id = r.person_id WHERE r.certificate_id = ?`,
    )
    .bind(id)
    .first<{ eventSlug: string; name: string; role: Role }>();

  return role && { id, ...role };
}
