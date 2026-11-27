import type { Selectable } from "kysely";
import type { Db, EventsTable } from "./db";
import { pointUrl, type Point } from "./geo";

/** A question the register form asks besides name, email and phone. */
export type Question = {
  id: string;
  label: string;
  required?: boolean;
  /** Present for a choice; absent for free text. */
  options?: string[];
};

export type Place =
  | {
      kind: "venue";
      name: string;
      address: string;
      /** Shows the venue on a map. Absent until the admin places it. */
      point?: Point;
    }
  | { kind: "online"; platform: string };

/** Where "Ver en el mapa" goes: Google Maps at the venue's point. */
export const mapLink = (place: Place): string | undefined =>
  place.kind === "venue" && place.point ? pointUrl(place.point) : undefined;

export const kinds = ["hackathon", "workshop", "talk", "meetup"] as const;
export const backdrops = ["plain", "grid", "dots", "glow"] as const;
export const fonts = ["sans", "pixel", "mono", "serif"] as const;
export type Kind = (typeof kinds)[number];
export type Backdrop = (typeof backdrops)[number];
export type Font = (typeof fonts)[number];

export type Theme = {
  kind: Kind;
  /** A #rrggbb color; the page's tint palette is derived from it. */
  accent: string;
  backdrop: Backdrop;
  /** The typeface of the title and the section labels. */
  font: Font;
};

export type EventStatus = "draft" | "published";

/** The event's copy in the connected Google Calendar. */
export type CalendarLink = {
  eventId: string;
  /** The event in Google Calendar, for the admin. */
  htmlUrl: string;
  /** Absent while Google is still creating the call. */
  meetUrl?: string;
};

export type EventMeta = {
  slug: string;
  title: string;
  /** One or two sentences for the list, link previews and the calendar. */
  summary: string;
  /** Markdown. */
  body: string;
  /** ISO 8601 with offset, e.g. 2026-12-12T15:00:00-05:00. */
  start: string;
  end: string;
  place: Place;
  /** Registrations past this go to the waitlist. Absent means no limit. */
  capacity?: number;
  /** An R2 key under MEDIA, served at /media/<key>. */
  coverKey?: string;
  questions: Question[];
  status: EventStatus;
  recordingUrl?: string;
  theme: Theme;
  /** A featured upcoming event leads the home page. */
  featured: boolean;
  calendar?: CalendarLink;
};

export const kindLabel: Record<Kind, string> = {
  hackathon: "Hackathon",
  workshop: "Taller",
  talk: "Charla",
  meetup: "Meetup",
};

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** The event's kind label, or null when its title already names the kind. */
export function kindTag(event: EventMeta): string | null {
  const label = kindLabel[event.theme.kind];
  return fold(event.title).includes(fold(label)) ? null : label;
}

export const hasEnded = (event: EventMeta, now: Date) =>
  new Date(event.end) <= now;

export const coverUrl = (event: EventMeta) =>
  event.coverKey ? `/media/${event.coverKey}` : undefined;

export const eventUrl = (origin: string, event: EventMeta) =>
  `${origin}/${event.slug}`;

function fromRow(r: Selectable<EventsTable>): EventMeta {
  return {
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    body: r.body,
    start: r.start_at,
    end: r.end_at,
    place:
      r.place_kind === "venue"
        ? {
            kind: "venue",
            name: r.place_name,
            address: r.place_address,
            ...(r.lat !== null && r.lng !== null
              ? { point: { lat: r.lat, lng: r.lng } }
              : {}),
          }
        : { kind: "online", platform: r.place_name },
    ...(r.capacity !== null ? { capacity: r.capacity } : {}),
    ...(r.cover_key ? { coverKey: r.cover_key } : {}),
    questions: JSON.parse(r.questions),
    status: r.status,
    ...(r.recording_url ? { recordingUrl: r.recording_url } : {}),
    theme: {
      kind: r.kind,
      accent: r.accent,
      backdrop: r.backdrop,
      font: r.font,
    },
    featured: r.featured === 1,
    ...(r.google_event_id
      ? {
          calendar: {
            eventId: r.google_event_id,
            htmlUrl: r.google_event_url ?? "",
            ...(r.meet_url ? { meetUrl: r.meet_url } : {}),
          },
        }
      : {}),
  };
}

/** The columns the admin's editor writes. */
function toRow(event: EventMeta) {
  const place = event.place;
  const venue = place.kind === "venue" ? place : null;

  return {
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    body: event.body,
    start_at: event.start,
    end_at: event.end,
    place_kind: place.kind,
    place_name: place.kind === "venue" ? place.name : place.platform,
    place_address: venue?.address ?? "",
    lat: venue?.point?.lat ?? null,
    lng: venue?.point?.lng ?? null,
    capacity: event.capacity ?? null,
    cover_key: event.coverKey ?? null,
    questions: JSON.stringify(event.questions),
    status: event.status,
    recording_url: event.recordingUrl ?? null,
    kind: event.theme.kind,
    accent: event.theme.accent,
    backdrop: event.theme.backdrop,
    font: event.theme.font,
    featured: event.featured ? 1 : 0,
  } as const;
}

/** Every event, drafts included, by start date. */
export async function listEvents(db: Db): Promise<EventMeta[]> {
  const rows = await db
    .selectFrom("events")
    .selectAll()
    .orderBy("start_at")
    .execute();
  return rows.map(fromRow);
}

export async function findEvent(
  db: Db,
  slug: string,
): Promise<EventMeta | null> {
  const row = await db
    .selectFrom("events")
    .selectAll()
    .where("slug", "=", slug)
    .executeTakeFirst();
  return row ? fromRow(row) : null;
}

/**
 * Inserts an event, or replaces the one at `previousSlug`. Registrations and
 * roles follow a changed slug. A featured event takes the flag from every
 * other event: the home page has one spotlight.
 */
export async function saveEvent(
  db: Db,
  event: EventMeta,
  now: string,
  previousSlug?: string,
): Promise<void> {
  const row = toRow(event);

  const write =
    previousSlug === undefined
      ? db
          .insertInto("events")
          .values({ ...row, created_at: now, updated_at: now })
      : db
          .updateTable("events")
          .set({ ...row, updated_at: now })
          .where("slug", "=", previousSlug);

  const unfeature = db
    .updateTable("events")
    .set({ featured: 0 })
    .where("slug", "!=", event.slug)
    .where("featured", "=", 1);

  await db.batch(event.featured ? [write, unfeature] : [write]);
}

/** Records the event's Google Calendar copy, or forgets it with null. */
export async function linkCalendar(
  db: Db,
  slug: string,
  link: CalendarLink | null,
) {
  await db
    .updateTable("events")
    .set({
      google_event_id: link?.eventId ?? null,
      google_event_url: link?.htmlUrl ?? null,
      meet_url: link?.meetUrl ?? null,
    })
    .where("slug", "=", slug)
    .execute();
}

/** Deletes the event and its roles. The database refuses one with registrations. */
export async function deleteEvent(db: Db, slug: string) {
  await db.deleteFrom("events").where("slug", "=", slug).execute();
}
