/** A question the register form asks besides name, email and phone. */
export type Question = {
  id: string;
  label: string;
  required?: boolean;
  /** Present for a choice; absent for free text. */
  options?: string[];
};

export type Place =
  | { kind: "venue"; name: string; address: string; mapUrl?: string }
  | { kind: "online"; platform: string };

export const kinds = ["hackathon", "taller", "charla", "meetup"] as const;
export const backdrops = ["plain", "grid", "dots", "glow"] as const;
export type Kind = (typeof kinds)[number];
export type Backdrop = (typeof backdrops)[number];

export type Theme = {
  kind: Kind;
  /** A #rrggbb color for buttons, the cover and the kind chip. */
  accent: string;
  backdrop: Backdrop;
};

export type EventStatus = "draft" | "published";

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
  hosts: string[];
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
};

export const kindLabel: Record<Kind, string> = {
  hackathon: "Hackathon",
  taller: "Taller",
  charla: "Charla",
  meetup: "Meetup",
};

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
  map_url: string | null;
  hosts: string;
  capacity: number | null;
  cover_key: string | null;
  questions: string;
  status: EventStatus;
  recording_url: string | null;
  kind: Kind;
  accent: string;
  backdrop: Backdrop;
  featured: number;
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
            ...(r.map_url ? { mapUrl: r.map_url } : {}),
          }
        : { kind: "online", platform: r.place_name },
    hosts: JSON.parse(r.hosts),
    ...(r.capacity !== null ? { capacity: r.capacity } : {}),
    ...(r.cover_key ? { coverKey: r.cover_key } : {}),
    questions: JSON.parse(r.questions),
    status: r.status,
    ...(r.recording_url ? { recordingUrl: r.recording_url } : {}),
    theme: { kind: r.kind, accent: r.accent, backdrop: r.backdrop },
    featured: r.featured === 1,
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
    place.kind === "venue" ? (place.mapUrl ?? null) : null,
    JSON.stringify(event.hosts),
    event.capacity ?? null,
    event.coverKey ?? null,
    JSON.stringify(event.questions),
    event.status,
    event.recordingUrl ?? null,
    event.theme.kind,
    event.theme.accent,
    event.theme.backdrop,
    event.featured ? 1 : 0,
    now,
  ];
  const columns = `slug, title, summary, body, start_at, end_at, place_kind,
    place_name, place_address, map_url, hosts, capacity, cover_key, questions,
    status, recording_url, kind, accent, backdrop, featured`;
  const sets = columns
    .split(",")
    .map((c, i) => `${c.trim()} = ?${i + 1}`)
    .join(", ");
  const write =
    previousSlug === undefined
      ? db
          .prepare(
            `INSERT INTO events (${columns}, created_at, updated_at)
             VALUES (${values.map((_, i) => `?${i + 1}`).join(", ")}, ?21)`,
          )
          .bind(...values)
      : db
          .prepare(
            `UPDATE events SET ${sets}, updated_at = ?21 WHERE slug = ?22`,
          )
          .bind(...values, previousSlug);
  const unfeature = db
    .prepare("UPDATE events SET featured = 0 WHERE slug != ? AND featured = 1")
    .bind(event.slug);
  await db.batch(event.featured ? [write, unfeature] : [write]);
}

export async function deleteEvent(db: D1Database, slug: string) {
  await db.prepare("DELETE FROM events WHERE slug = ?").bind(slug).run();
}
