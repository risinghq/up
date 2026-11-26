import { placeLine } from "../calendar";
import { linkCalendar, type CalendarLink, type EventMeta } from "../events";
import type { Env, Fetch } from "../web";
import { calendarToken } from "./account";
import { call, gone } from "./api";
import { credentials } from "./oauth";

const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

type CalendarEvent = {
  id: string;
  htmlLink: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
};

/** The calendar entry for an event. The time zone names Lima so Google shows it as the site does. */
export function calendarBody(event: EventMeta, pageUrl: string) {
  return {
    summary: event.title,
    description: `${event.summary}\n\n${pageUrl}`,
    location: placeLine(event),
    start: { dateTime: event.start, timeZone: "America/Lima" },
    end: { dateTime: event.end, timeZone: "America/Lima" },
    source: { title: "up.rising.sh", url: pageUrl },
  };
}

const toLink = (e: CalendarEvent): CalendarLink => {
  const meet =
    e.hangoutLink ??
    e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")
      ?.uri;
  return {
    eventId: e.id,
    htmlUrl: e.htmlLink,
    ...(meet ? { meetUrl: meet } : {}),
  };
};

/**
 * Creates the event in the account's primary calendar with a Meet call, or
 * updates the copy in `current`. A copy deleted in Google is created again.
 * Nobody is invited, so Google sends no email.
 */
export async function syncEvent(
  fetcher: Fetch,
  token: string,
  event: EventMeta,
  pageUrl: string,
  current?: CalendarLink,
): Promise<CalendarLink> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const body = calendarBody(event, pageUrl);

  if (current) {
    try {
      const patched = await call<CalendarEvent>(
        fetcher,
        `${EVENTS_URL}/${encodeURIComponent(current.eventId)}?conferenceDataVersion=1&sendUpdates=none`,
        { method: "PATCH", headers, body: JSON.stringify(body) },
      );
      if (patched.hangoutLink || patched.conferenceData) return toLink(patched);
      return toLink(await addMeet(fetcher, headers, patched.id));
    } catch (error) {
      if (!gone(error)) throw error;
    }
  }

  const created = await call<CalendarEvent>(
    fetcher,
    `${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=none`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, conferenceData: meetRequest() }),
    },
  );
  return toLink(created);
}

const meetRequest = () => ({
  createRequest: {
    requestId: crypto.randomUUID(),
    conferenceSolutionKey: { type: "hangoutsMeet" },
  },
});

/** Adds a Meet call to an entry whose call someone removed in Google. */
const addMeet = (fetcher: Fetch, headers: Record<string, string>, id: string) =>
  call<CalendarEvent>(
    fetcher,
    `${EVENTS_URL}/${encodeURIComponent(id)}?conferenceDataVersion=1&sendUpdates=none`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ conferenceData: meetRequest() }),
    },
  );

/** Deletes the copy. One already gone counts as deleted. */
export async function deleteCalendarEvent(
  fetcher: Fetch,
  token: string,
  eventId: string,
) {
  try {
    await call(
      fetcher,
      `${EVENTS_URL}/${encodeURIComponent(eventId)}?sendUpdates=none`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (error) {
    if (!gone(error)) throw error;
  }
}

type CalendarEnv = Pick<
  Env,
  "DB" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"
>;

/**
 * Creates or updates the event's calendar copy and Meet call, and stores the
 * link. False when no account is connected or Google failed.
 */
export async function syncCalendar(
  env: CalendarEnv,
  fetcher: Fetch,
  event: EventMeta,
  pageUrl: string,
): Promise<boolean> {
  try {
    const token = await calendarToken(env.DB, fetcher, credentials(env));
    if (!token) return false;

    const link = await syncEvent(
      fetcher,
      token,
      event,
      pageUrl,
      event.calendar,
    );
    await linkCalendar(env.DB, event.slug, link);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

/** Deletes the event's calendar copy. A failure leaves an orphan in Google, never a broken admin. */
export async function dropCalendar(
  env: CalendarEnv,
  fetcher: Fetch,
  event: EventMeta,
) {
  if (!event.calendar) return;

  try {
    const token = await calendarToken(env.DB, fetcher, credentials(env));
    if (token)
      await deleteCalendarEvent(fetcher, token, event.calendar.eventId);
  } catch (error) {
    console.error(error);
  }
}
