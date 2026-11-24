import type { FunctionComponent } from "preact";

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

export type EventMeta = {
  slug: string;
  title: string;
  /** One or two sentences for the list, link previews and the calendar. */
  summary: string;
  /** ISO 8601 with offset, e.g. 2026-12-12T15:00:00-05:00. */
  start: string;
  end: string;
  place: Place;
  hosts: string[];
  /** Registrations past this go to the waitlist. Absent means no limit. */
  capacity?: number;
  /** A path under public/, 1200x630 so it doubles as the link preview. */
  cover?: string;
  questions: Question[];
  /** A draft is served only where SHOW_DRAFTS is set. */
  draft?: boolean;
  recordingUrl?: string;
};

export type EventEntry = { meta: EventMeta; Body: FunctionComponent };
