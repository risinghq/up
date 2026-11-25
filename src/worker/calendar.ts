import type { EventMeta } from "./events";

/** 2026-12-12T20:00:00Z -> 20261212T200000Z */
const stamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export const placeLine = (event: EventMeta) =>
  event.place.kind === "venue"
    ? `${event.place.name}, ${event.place.address}`
    : event.place.platform;

export function googleCalendarUrl(event: EventMeta, pageUrl: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${stamp(event.start)}/${stamp(event.end)}`,
    details: `${event.summary}\n\n${pageUrl}`,
    location: placeLine(event),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// RFC 5545 text: escape backslash, semicolon and comma; newlines become \n.
const escape = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

export function ics(event: EventMeta, pageUrl: string, now: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//rising.sh//up//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.slug}@up.rising.sh`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(`${event.summary}\n\n${pageUrl}`)}`,
    `LOCATION:${escape(placeLine(event))}`,
    `URL:${pageUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
