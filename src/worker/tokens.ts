const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** 128 random bits, base64url: a ticket, invite or session token. */
export const newToken = () =>
  base64url(crypto.getRandomValues(new Uint8Array(16)));

/** The SHA-256 of a token, hex. Tables that hold secrets store only this. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
