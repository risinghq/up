import type { Env, Fetch } from "../web";
import { call, form, GoogleError } from "./api";

export type GoogleCredentials = { clientId: string; clientSecret: string };

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
// calendar.events reads and writes events only; email names the account.
const SCOPE = "openid email https://www.googleapis.com/auth/calendar.events";

/** The OAuth client, or null when the env lacks either half. */
export const credentials = (
  env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">,
): GoogleCredentials | null =>
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : null;

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
