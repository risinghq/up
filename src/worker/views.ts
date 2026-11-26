import { renderSVG } from "uqr";
import type { EventView, Notice, TeamGroup } from "../pages/Event";
import { googleCalendarUrl } from "./calendar";
import { issuesCertificates, type Certificate } from "./certificates";
import { hasEnded, type EventMeta } from "./events";
import type { FormState } from "./form";
import type { Profile } from "./profiles";
import type { Ticket } from "./registrations";
import { roleLabel, roles, type EventRole, type Role } from "./roles";
import { dateSpan } from "./time";

/** What every view builder knows about the request. */
export type ViewContext = {
  /** The site's origin, without a trailing slash. */
  origin: string;
  now: Date;
};

export const eventUrl = (origin: string, event: EventMeta) =>
  `${origin}/${event.slug}`;

/** The event's people in role groups, each name linked to its profile. */
function teamGroups(
  team: EventRole[],
  profiles: Map<string, string>,
): TeamGroup[] {
  return roles.flatMap((role) => {
    const people = team
      .filter((person) => person.role === role)
      .map((person) => {
        const profileId = person.email && profiles.get(person.email);
        return {
          name: person.name,
          ...(profileId && { url: `/p/${profileId}` }),
        };
      });
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
    /** Profile ids of the people who have one, by email. */
    profiles: Map<string, string>;
    form: FormState;
    notice: Notice;
    admin: boolean;
    turnstileKey: string | null;
  },
): EventView {
  const { event } = input;
  return {
    event,
    team: teamGroups(input.team, input.profiles),
    going: input.going,
    ended: hasEnded(event, context.now),
    form: input.form,
    notice: input.notice,
    calendarUrl: googleCalendarUrl(event, eventUrl(context.origin, event)),
    admin: input.admin,
    turnstileKey: input.turnstileKey,
  };
}

/** The panels under the ticket, in the order the page shows them. */
export type TicketPanel =
  | "certificate"
  | "next"
  | "venue"
  | "share"
  | "profile";

/** Where the holder stands: the ticket's status until the event ends. */
export type Standing = Ticket["status"] | "attended" | "missed";

export type TicketView = {
  ticket: Ticket;
  event: EventMeta;
  standing: Standing;
  /** True on the redirect right after registering. */
  fresh: boolean;
  ticketUrl: string;
  /** True when an admin opens the ticket, as at the door after a scan. */
  door: boolean;
  /** SVG of a QR code of the ticket's link, for the venue's door. */
  qr?: string;
  panels: TicketPanel[];
  next: {
    /** True once the holder is inside: no calendar, no cancelling. */
    inside: boolean;
    /** The event's Google Meet call; only a ticket with a seat gets it. */
    meetUrl?: string;
    calendarUrl: string;
    whatsapp: string;
    /** The community link is the primary action when nothing outranks it. */
    communityPrimary: boolean;
  };
  /** The public "voy" link, once the holder made one. */
  shareUrl?: string;
  /** The holder's certificate, once the event they came in to is over. */
  certificateUrl?: string;
  profile: {
    /** The holder's public profile, once they opened it. */
    url?: string;
    /** After check-in the profile is the next thing to do. */
    primary: boolean;
    /** True when the holder has a role at a published event. */
    hasRole: boolean;
  };
  /** The 3D credential: only a seat at an event still ahead has one. */
  credential: boolean;
  /** A cancelled ticket of an event still ahead offers to register again. */
  rejoin: boolean;
};

/**
 * Decides what a ticket page shows. A live ticket (not cancelled, event not
 * ended) gets the next steps and the share panel. The profile panel shows
 * once there is something to put on it: a check-in, an open profile, or a
 * role at an event. After check-in the profile leads and the venue goes;
 * once the event is over, the certificate leads.
 */
export function ticketView(
  context: ViewContext,
  input: {
    ticket: Ticket;
    event: EventMeta;
    fresh: boolean;
    door: boolean;
    whatsapp: string;
    hasRole: boolean;
  },
): TicketView {
  const { ticket, event } = input;
  const origin = context.origin;
  const ended = hasEnded(event, context.now);
  const live = ticket.status !== "cancelled" && !ended;
  const inside = Boolean(ticket.checkedInAt);
  const ticketUrl = `${origin}/entrada/${ticket.token}`;
  const meetUrl =
    ticket.status === "going" ? event.calendar?.meetUrl : undefined;
  const profileUrl = ticket.profileId
    ? `${origin}/p/${ticket.profileId}`
    : undefined;

  const certificateUrl =
    inside && ticket.certificateId && issuesCertificates(event, context.now)
      ? `${origin}/c/${ticket.certificateId}`
      : undefined;

  const showNext = live && !(inside && !meetUrl && !input.whatsapp);
  const showProfile = inside || Boolean(profileUrl) || input.hasRole;
  const order: TicketPanel[] = inside
    ? ["certificate", "profile", "next", "share"]
    : ["next", "venue", "share", "profile"];
  const shown: Record<TicketPanel, boolean> = {
    certificate: Boolean(certificateUrl),
    next: showNext,
    venue: live,
    share: live,
    profile: showProfile,
  };

  return {
    ticket,
    event,
    standing: standing(ticket, inside, ended),
    fresh: input.fresh,
    ticketUrl,
    door: input.door,
    ...(live &&
      !inside &&
      event.place.kind === "venue" && {
        qr: renderSVG(ticketUrl, { border: 2 }),
      }),
    panels: order.filter((panel) => shown[panel]),
    next: {
      inside,
      meetUrl,
      calendarUrl: googleCalendarUrl(event, eventUrl(origin, event)),
      whatsapp: input.whatsapp,
      communityPrimary: !meetUrl && !inside,
    },
    shareUrl: ticket.shareId
      ? `${eventUrl(origin, event)}/voy/${ticket.shareId}`
      : undefined,
    certificateUrl,
    profile: {
      url: profileUrl,
      primary: inside && !certificateUrl,
      hasRole: input.hasRole,
    },
    credential: ticket.status === "going" && !ended,
    rejoin: ticket.status === "cancelled" && !ended,
  };
}

function standing(ticket: Ticket, inside: boolean, ended: boolean): Standing {
  if (inside) return ended ? "attended" : ticket.status;
  if (ended && ticket.status !== "cancelled") return "missed";
  return ticket.status;
}

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
  role === "organiza"
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

export type CertificateView = {
  event: EventMeta;
  name: string;
  /** What the person did, before the event's title: "asistió a". */
  verb: string;
  date: string;
  place: string;
  /** The page's own address, printed so a reader can check it. */
  url: string;
};

const certificateVerb: Record<Role, string> = {
  organiza: "organizó",
  ponente: "fue ponente en",
  mentor: "fue mentor en",
  jurado: "fue jurado en",
  voluntario: "fue voluntario en",
};

/** A certificate: who, what they did, at which event, when and where. */
export function certificateView(
  context: ViewContext,
  certificate: Certificate,
  event: EventMeta,
): CertificateView {
  const { role } = certificate;
  return {
    event,
    name: certificate.name,
    verb: role ? certificateVerb[role] : "asistió a",
    date: dateSpan(event.start, event.end),
    place: event.place.kind === "venue" ? event.place.name : "En línea",
    url: `${context.origin}/c/${certificate.id}`,
  };
}
