import { googleCalendarUrl } from "../worker/calendar";
import { eventUrl, hasEnded, type EventMeta } from "../worker/events";
import type { FormState } from "../worker/form";
import { roleLabel, roles, type EventRole, type Role } from "../worker/roles";
import type { ViewContext } from "../worker/web";

/** Why the register card shows what it shows. */
export type Notice = "exists" | null;

/** A person as the page shows them: the name, linked to a public profile. */
export type PersonLink = { name: string; url?: string };

/** The people who hold one role at the event, e.g. "Ponentes". */
export type TeamGroup = { role: Role; label: string; people: PersonLink[] };

export type EventView = {
  event: EventMeta;
  team: TeamGroup[];
  going: number;
  ended: boolean;
  form: FormState;
  notice: Notice;
  calendarUrl: string;
  /** A signed-in admin sees links to edit the event. */
  admin: boolean;
  /** The Turnstile site key; with it, the form carries the widget. */
  turnstileKey: string | null;
};

/** The event's people in role groups, each name linked to its profile. */
function teamGroups(team: EventRole[]): TeamGroup[] {
  return roles.flatMap((role) => {
    const people = team
      .filter((person) => person.role === role)
      .map((person) => ({
        name: person.name,
        ...(person.profileId && { url: `/p/${person.profileId}` }),
      }));
    return people.length ? [{ role, label: roleLabel[role].many, people }] : [];
  });
}

/** The event page: the event, its people by role, the form. */
export function eventView(
  context: ViewContext,
  input: {
    event: EventMeta;
    going: number;
    team: EventRole[];
    form: FormState;
    notice: Notice;
    admin: boolean;
    turnstileKey: string | null;
  },
): EventView {
  const { event } = input;
  return {
    event,
    team: teamGroups(input.team),
    going: input.going,
    ended: hasEnded(event, context.now),
    form: input.form,
    notice: input.notice,
    calendarUrl: googleCalendarUrl(event, eventUrl(context.origin, event)),
    admin: input.admin,
    turnstileKey: input.turnstileKey,
  };
}
