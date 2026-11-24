import { placeLine } from "./calendar";
import type { CalendarLink, EventMeta } from "./events";

/** The slice of `fetch` this module uses, so a test can stand in for Google. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type GoogleCredentials = { clientId: string; clientSecret: string };

export type GoogleAccount = {
  email: string;
  refreshToken: string;
  connectedBy: string;
  connectedAt: string;
};

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
// calendar.events reads and writes events only; email names the account.
const SCOPE = "openid email https://www.googleapis.com/auth/calendar.events";

/** The consent page. `offline` and `consent` make Google return a refresh token every time. */
export function authUrl(
  creds: GoogleCredentials,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function call<T>(
  fetcher: Fetch,
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetcher(url, init);
  if (!response.ok)
    throw new GoogleError(
      response.status,
      `Google ${init.method ?? "GET"} ${new URL(url).pathname}: ${response.status} ${await response.text()}`,
    );
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const form = (fields: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields),
});

/** The id token comes straight from Google's token endpoint over TLS, so its claims are read without checking the signature. */
function emailClaim(idToken: string): string {
  const payload = idToken.split(".")[1] ?? "";
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  const email = (JSON.parse(json) as { email?: unknown }).email;
  if (typeof email !== "string") throw new GoogleError(502, "No email claim");
  return email;
}

/** Trades the consent code for the account's email and refresh token. */
export async function exchangeCode(
  fetcher: Fetch,
  creds: GoogleCredentials,
  code: string,
  redirectUri: string,
): Promise<{ email: string; refreshToken: string }> {
  const tokens = await call<{ refresh_token?: string; id_token?: string }>(
    fetcher,
    TOKEN_URL,
    form({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
  if (!tokens.refresh_token || !tokens.id_token)
    throw new GoogleError(502, "Google returned no refresh token");
  return {
    email: emailClaim(tokens.id_token),
    refreshToken: tokens.refresh_token,
  };
}

export async function accessToken(
  fetcher: Fetch,
  creds: GoogleCredentials,
  refreshToken: string,
): Promise<string> {
  const tokens = await call<{ access_token: string }>(
    fetcher,
    TOKEN_URL,
    form({
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
    }),
  );
  return tokens.access_token;
}

export async function revoke(fetcher: Fetch, refreshToken: string) {
  await call(fetcher, REVOKE_URL, form({ token: refreshToken }));
}

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
      if (!(error instanceof GoogleError && [404, 410].includes(error.status)))
        throw error;
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
    if (!(error instanceof GoogleError && [404, 410].includes(error.status)))
      throw error;
  }
}

// The connected account: one row in google_account.

type AccountRow = {
  email: string;
  refresh_token: string;
  connected_by: string;
  connected_at: string;
};

export async function findAccount(
  db: D1Database,
): Promise<GoogleAccount | null> {
  const row = await db
    .prepare("SELECT * FROM google_account WHERE id = 1")
    .first<AccountRow>();
  return (
    row && {
      email: row.email,
      refreshToken: row.refresh_token,
      connectedBy: row.connected_by,
      connectedAt: row.connected_at,
    }
  );
}

export async function saveAccount(db: D1Database, account: GoogleAccount) {
  await db
    .prepare(
      `INSERT INTO google_account (id, email, refresh_token, connected_by, connected_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET email = excluded.email,
         refresh_token = excluded.refresh_token,
         connected_by = excluded.connected_by,
         connected_at = excluded.connected_at`,
    )
    .bind(
      account.email,
      account.refreshToken,
      account.connectedBy,
      account.connectedAt,
    )
    .run();
}

export async function deleteAccount(db: D1Database) {
  await db.prepare("DELETE FROM google_account").run();
}
