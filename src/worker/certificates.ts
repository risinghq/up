import type { Db } from "./db";
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
  db: Db,
  id: string,
): Promise<Certificate | null> {
  const ticket = await db
    .selectFrom("registrations as r")
    .innerJoin("people as p", "p.id", "r.person_id")
    .select(["r.event_slug as eventSlug", "r.person_id as personId", "p.name"])
    .where("r.certificate_id", "=", id)
    .where("r.checked_in_at", "is not", null)
    .executeTakeFirst();

  if (ticket) {
    const held = await db
      .selectFrom("event_roles")
      .select("role")
      .where("event_slug", "=", ticket.eventSlug)
      .where("person_id", "=", ticket.personId)
      .execute();

    return {
      id,
      eventSlug: ticket.eventSlug,
      name: ticket.name,
      role: firstRole(held.map((row) => row.role)),
    };
  }

  const role = await db
    .selectFrom("event_roles as r")
    .innerJoin("people as p", "p.id", "r.person_id")
    .select(["r.event_slug as eventSlug", "p.name", "r.role"])
    .where("r.certificate_id", "=", id)
    .executeTakeFirst();

  return role ? { id, ...role } : null;
}
