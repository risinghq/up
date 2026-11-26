import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createSession, endSession, SESSION_DAYS } from "./auth";
import type { Ctx } from "./web";

export const SESSION_COOKIE = "up_session";

/** Signs the person in on this browser. */
export async function startSession(c: Ctx, personId: string, now: string) {
  setCookie(c, SESSION_COOKIE, await createSession(c.env.DB, personId, now), {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: c.env.SITE_URL.startsWith("https:"),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function closeSession(c: Ctx) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await endSession(c.env.DB, token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/**
 * Where to send a person after signing in: a path on this site, or the
 * account page.
 * Anything else, such as `//evil.example`, would leave the site.
 */
export function returnPath(value: string | undefined | null): string {
  const path = String(value ?? "");
  return /^\/(?![/\\])/.test(path) ? path : "/cuenta";
}
