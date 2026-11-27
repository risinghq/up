import { sql } from "kysely";
import type { Db } from "./db";
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
  db: Db,
  email: string,
  personId: string | null,
  now: string,
): Promise<string | null> {
  const code = sixDigits();
  const row = await db
    .insertInto("sign_in_codes")
    .values({
      email,
      code_hash: await codeHash(email, code),
      person_id: personId,
      attempts: 0,
      sent_at: now,
      expires_at: later(now, CODE_MINUTES * MINUTE),
    })
    .onConflict((oc) =>
      oc
        .column("email")
        .doUpdateSet({
          code_hash: sql`excluded.code_hash`,
          person_id: sql`excluded.person_id`,
          attempts: 0,
          sent_at: sql`excluded.sent_at`,
          expires_at: sql`excluded.expires_at`,
          verified_at: null,
        })
        .where("sign_in_codes.sent_at", "<=", later(now, -RESEND_MS)),
    )
    .returning("email")
    .executeTakeFirst();
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
  db: Db,
  email: string,
  code: string,
  personId: string | null,
  now: string,
): Promise<CodeCheck> {
  const row = await db
    .updateTable("sign_in_codes")
    .set((eb) => ({ attempts: eb("attempts", "+", 1) }))
    .where("email", "=", email)
    .where(sql<boolean>`person_id is ${personId}`)
    .where("verified_at", "is", null)
    .where("expires_at", ">", now)
    .where("attempts", "<", CODE_TRIES)
    .returning(["code_hash", "attempts"])
    .executeTakeFirst();
  if (!row) return { kind: "gone" };

  if (row.code_hash !== (await codeHash(email, code.replace(/\s/g, "")))) {
    const left = CODE_TRIES - row.attempts;
    return left > 0 ? { kind: "wrong", left } : { kind: "gone" };
  }

  await db.deleteFrom("sign_in_codes").where("email", "=", email).execute();
  return { kind: "ok" };
}

/**
 * Records that a sign-in code proved an email with no account yet, and
 * returns the token the new-account form carries back.
 */
export async function issueVerified(
  db: Db,
  email: string,
  now: string,
): Promise<string> {
  const token = newToken();
  await db
    .insertInto("sign_in_codes")
    .orReplace()
    .values({
      email,
      code_hash: await codeHash(email, token),
      attempts: 0,
      sent_at: now,
      expires_at: later(now, VERIFIED_MS),
      verified_at: now,
    })
    .execute();
  return token;
}

/** Spends the token issueVerified made; true when the email is still proven. */
export async function takeVerified(
  db: Db,
  email: string,
  token: string,
  now: string,
): Promise<boolean> {
  const row = await db
    .deleteFrom("sign_in_codes")
    .where("email", "=", email)
    .where("code_hash", "=", await codeHash(email, token))
    .where("verified_at", "is not", null)
    .where("expires_at", ">", now)
    .returning("email")
    .executeTakeFirst();
  return Boolean(row);
}
