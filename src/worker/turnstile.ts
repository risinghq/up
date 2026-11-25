import type { Fetch } from "./google";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The form field the widget fills with its token. */
export const TOKEN_FIELD = "cf-turnstile-response";

/** Cloudflare refuses longer tokens without looking at them. */
const MAX_TOKEN = 2048;

export type Verdict = "human" | "missing" | "refused";

/**
 * Asks Turnstile whether the token came from a person. When Cloudflare cannot
 * answer, the post goes through: a bot cannot cause that outage, and refusing
 * would turn every visitor away while it lasts.
 */
export async function verifyHuman(
  fetcher: Fetch,
  secret: string,
  token: string,
  ip: string | null,
): Promise<Verdict> {
  if (!token) return "missing";
  if (token.length > MAX_TOKEN) return "refused";

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  let response: Response;
  try {
    response = await fetcher(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("turnstile unreachable", error);
    return "human";
  }
  if (!response.ok) {
    console.error("turnstile answered", response.status);
    return "human";
  }

  const result = await response.json<{ success?: boolean }>();
  return result.success ? "human" : "refused";
}
