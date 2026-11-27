import type { EventMeta } from "../worker/events";
import type { Profile } from "../worker/profiles";
import { roleLabel, roles, type Role } from "../worker/roles";

/** The events where a person held one role, newest first. */
export type RoleEvents = {
  role: Role;
  title: string;
  /** The count's noun after the number: "3 organizados", "1 como jurado". */
  tally: string;
  events: EventMeta[];
};

export type ProfileView = {
  firstName: string;
  since: string;
  /** Attended events, newest first. */
  events: EventMeta[];
  /** One group per role the person held, in the order of `roles`. */
  roles: RoleEvents[];
  /** The page's meta description. */
  description: string;
};

const tally = (role: Role, count: number) =>
  role === "organizer"
    ? count === 1
      ? "organizado"
      : "organizados"
    : `como ${roleLabel[role].one.toLowerCase()}`;

/** A public profile: the person's events, newest first, from every event. */
export function profileView(
  profile: Profile,
  events: EventMeta[],
): ProfileView {
  const newest = [...events].sort((a, b) => b.start.localeCompare(a.start));
  const among = (slugs: string[]) =>
    newest.filter((e) => slugs.includes(e.slug));
  const groups = roles.flatMap((role) => {
    const held = among(
      profile.roles.filter((r) => r.role === role).map((r) => r.slug),
    );
    return held.length
      ? [
          {
            role,
            title: roleLabel[role].one,
            tally: tally(role, held.length),
            events: held,
          },
        ]
      : [];
  });
  const name = profile.firstName;

  return {
    firstName: name,
    since: profile.since,
    events: among(profile.attended),
    roles: groups,
    description: groups.length
      ? `Los eventos en los que participa ${name} y a los que fue.`
      : `Los eventos a los que fue ${name}.`,
  };
}
