import { renderSVG } from "uqr";
import { googleCalendarUrl } from "../worker/calendar";
import { issuesCertificates } from "../worker/certificates";
import { eventUrl, hasEnded, type EventMeta } from "../worker/events";
import type { Ticket } from "../worker/registrations";
import type { ViewContext } from "../worker/web";

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
  /** The public "going" link, once the holder made one. */
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
  const ticketUrl = `${origin}/ticket/${ticket.token}`;
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
      ? `${eventUrl(origin, event)}/going/${ticket.shareId}`
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
