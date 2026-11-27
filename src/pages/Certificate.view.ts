import type { Certificate } from "../worker/certificates";
import type { EventMeta } from "../worker/events";
import type { Role } from "../worker/roles";
import { dateSpan } from "../worker/time";
import type { ViewContext } from "../worker/web";

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
  organizer: "organizó",
  speaker: "fue ponente en",
  mentor: "fue mentor en",
  judge: "fue jurado en",
  volunteer: "fue voluntario en",
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
