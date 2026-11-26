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

export const kinds = ["hackathon", "taller", "charla", "meetup"] as const;
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
  taller: "Taller",
  charla: "Charla",
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

type Row = {
  slug: string;
  title: string;
  summary: string;
  body: string;
  start_at: string;
  end_at: string;
  place_kind: "venue" | "online";
  place_name: string;
  place_address: string;
  lat: number | null;
  lng: number | null;
  capacity: number | null;
  cover_key: string | null;
  questions: string;
  status: EventStatus;
  recording_url: string | null;
  kind: Kind;
  accent: string;
  backdrop: Backdrop;
  font: Font;
  featured: number;
  google_event_id: string | null;
  google_event_url: string | null;
  meet_url: string | null;
};

function fromRow(r: Row): EventMeta {
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

/** Every event, drafts included, by start date. */
export async function listEvents(db: D1Database): Promise<EventMeta[]> {
  const { results } = await db
    .prepare("SELECT * FROM events ORDER BY start_at")
    .all<Row>();
  return results.map(fromRow);
}

export async function findEvent(
  db: D1Database,
  slug: string,
): Promise<EventMeta | null> {
  const row = await db
    .prepare("SELECT * FROM events WHERE slug = ?")
    .bind(slug)
    .first<Row>();
  return row && fromRow(row);
}

/**
 * Inserts an event, or replaces the one at `previousSlug`. The caller keeps
 * the slug of an event with registrations, which point at it by slug. A
 * featured event takes the flag from every other event: the home page has
 * one spotlight.
 */
export async function saveEvent(
  db: D1Database,
  event: EventMeta,
  now: string,
  previousSlug?: string,
): Promise<void> {
  const place = event.place;
  const values = [
    event.slug,
    event.title,
    event.summary,
    event.body,
    event.start,
    event.end,
    place.kind,
    place.kind === "venue" ? place.name : place.platform,
    place.kind === "venue" ? place.address : "",
    place.kind === "venue" ? (place.point?.lat ?? null) : null,
    place.kind === "venue" ? (place.point?.lng ?? null) : null,
    event.capacity ?? null,
    event.coverKey ?? null,
    JSON.stringify(event.questions),
    event.status,
    event.recordingUrl ?? null,
    event.theme.kind,
    event.theme.accent,
    event.theme.backdrop,
    event.theme.font,
    event.featured ? 1 : 0,
  ];
  const columns = `slug, title, summary, body, start_at, end_at, place_kind,
    place_name, place_address, lat, lng, capacity, cover_key, questions,
    status, recording_url, kind, accent, backdrop, font, featured`;
  const at = values.length + 1;
  const sets = columns
    .split(",")
    .map((c, i) => `${c.trim()} = ?${i + 1}`)
    .join(", ");
  const write =
    previousSlug === undefined
      ? db
          .prepare(
            `INSERT INTO events (${columns}, created_at, updated_at)
             VALUES (${values.map((_, i) => `?${i + 1}`).join(", ")}, ?${at}, ?${at})`,
          )
          .bind(...values, now)
      : db
          .prepare(
            `UPDATE events SET ${sets}, updated_at = ?${at} WHERE slug = ?${at + 1}`,
          )
          .bind(...values, now, previousSlug);
  const unfeature = db
    .prepare("UPDATE events SET featured = 0 WHERE slug != ? AND featured = 1")
    .bind(event.slug);
  await db.batch(event.featured ? [write, unfeature] : [write]);
}

/** Records the event's Google Calendar copy, or forgets it with null. */
export async function linkCalendar(
  db: D1Database,
  slug: string,
  link: CalendarLink | null,
) {
  await db
    .prepare(
      `UPDATE events SET google_event_id = ?, google_event_url = ?, meet_url = ?
       WHERE slug = ?`,
    )
    .bind(
      link?.eventId ?? null,
      link?.htmlUrl ?? null,
      link?.meetUrl ?? null,
      slug,
    )
    .run();
}

export async function deleteEvent(db: D1Database, slug: string) {
  await db.prepare("DELETE FROM events WHERE slug = ?").bind(slug).run();
}
