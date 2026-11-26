import { hashToken, newToken } from "./tokens";

const MINUTE = 60 * 1000;
export const CODE_MINUTES = 10;
const RESEND_MS = MINUTE;
const VERIFIED_MS = 30 * MINUTE;
export const CODE_TRIES = 5;

const later = (now: string, ms: number) =>
  new Date(Date.parse(now) + ms).toISOString();

const codeHash = (email: string, code: string) => hashToken(`${email}:${code}`);

/** Six digits; a million codes against five tries a code. */
const sixDigits = () =>
  String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(
    6,
    "0",
  );

/**
 * Makes the code that proves `email`, replacing any pending one, and returns
 * it to mail. `personId` names the account adding the email; a sign-in code
 * has none, and a code answers only the purpose it was made for. Returns null
 * inside the resend cooldown, so one address gets at most one code a minute.
 */
export async function requestCode(
  db: D1Database,
  email: string,
  personId: string | null,
  now: string,
): Promise<string | null> {
  const code = sixDigits();
  const row = await db
    .prepare(
      `INSERT INTO sign_in_codes (email, code_hash, person_id, attempts, sent_at, expires_at)
       VALUES (?1, ?2, ?3, 0, ?4, ?5)
       ON CONFLICT (email) DO UPDATE SET
         code_hash = excluded.code_hash,
         person_id = excluded.person_id,
         attempts = 0,
         sent_at = excluded.sent_at,
         expires_at = excluded.expires_at,
         verified_at = NULL
       WHERE sign_in_codes.sent_at <= ?6
       RETURNING email`,
    )
    .bind(
      email,
      await codeHash(email, code),
      personId,
      now,
      later(now, CODE_MINUTES * MINUTE),
      later(now, -RESEND_MS),
    )
    .first();
  return row ? code : null;
}

export type CodeCheck =
  | { kind: "ok" }
  | { kind: "wrong"; left: number }
  | { kind: "gone" };

/**
 * Checks a typed code. Every try counts, right or wrong, and a right one
 * spends the code. A code past its tries or its time is gone.
 */
export async function checkCode(
  db: D1Database,
  email: string,
  code: string,
  personId: string | null,
  now: string,
): Promise<CodeCheck> {
  const row = await db
    .prepare(
      `UPDATE sign_in_codes SET attempts = attempts + 1
       WHERE email = ? AND person_id IS ? AND verified_at IS NULL
         AND expires_at > ? AND attempts < ?
       RETURNING code_hash AS hash, attempts`,
    )
    .bind(email, personId, now, CODE_TRIES)
    .first<{ hash: string; attempts: number }>();
  if (!row) return { kind: "gone" };

  if (row.hash !== (await codeHash(email, code.replace(/\s/g, "")))) {
    const left = CODE_TRIES - row.attempts;
    return left > 0 ? { kind: "wrong", left } : { kind: "gone" };
  }

  await db
    .prepare("DELETE FROM sign_in_codes WHERE email = ?")
    .bind(email)
    .run();
  return { kind: "ok" };
}

/**
 * Records that a sign-in code proved an email with no account yet, and
 * returns the token the new-account form carries back.
 */
export async function issueVerified(
  db: D1Database,
  email: string,
  now: string,
): Promise<string> {
  const token = newToken();
  await db
    .prepare(
      `INSERT OR REPLACE INTO sign_in_codes (email, code_hash, attempts, sent_at, expires_at, verified_at)
       VALUES (?1, ?2, 0, ?3, ?4, ?3)`,
    )
    .bind(email, await codeHash(email, token), now, later(now, VERIFIED_MS))
    .run();
  return token;
}

/** Spends the token issueVerified made; true when the email is still proven. */
export async function takeVerified(
  db: D1Database,
  email: string,
  token: string,
  now: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `DELETE FROM sign_in_codes
       WHERE email = ? AND code_hash = ? AND verified_at IS NOT NULL AND expires_at > ?
       RETURNING email`,
    )
    .bind(email, await codeHash(email, token), now)
    .first();
  return Boolean(row);
}
