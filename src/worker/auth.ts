import type { Account } from "./accounts";
import { hashToken, newToken } from "./tokens";

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;
const CHALLENGE_MS = 5 * 60 * 1000;

const later = (now: string, ms: number) =>
  new Date(Date.parse(now) + ms).toISOString();

export type NewCredential = {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
};

export type StoredCredential = NewCredential & { personId: string };

/** A passkey as the account page lists it. */
export type Passkey = {
  id: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function addCredential(
  db: D1Database,
  personId: string,
  credential: NewCredential,
  now: string,
) {
  await db
    .prepare(
      `INSERT INTO credentials (id, person_id, public_key, counter, transports, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      credential.id,
      personId,
      credential.publicKey,
      credential.counter,
      JSON.stringify(credential.transports),
      now,
    )
    .run();
}

export async function listPasskeys(
  db: D1Database,
  personId: string,
): Promise<Passkey[]> {
  const { results } = await db
    .prepare(
      `SELECT id, created_at AS createdAt, last_used_at AS lastUsedAt
       FROM credentials WHERE person_id = ? ORDER BY created_at`,
    )
    .bind(personId)
    .all<Passkey>();
  return results;
}

/** Deletes one of the account's passkeys; another account's id does nothing. */
export async function removeCredential(
  db: D1Database,
  personId: string,
  id: string,
) {
  await db
    .prepare("DELETE FROM credentials WHERE id = ? AND person_id = ?")
    .bind(id, personId)
    .run();
}

export async function findCredential(
  db: D1Database,
  id: string,
): Promise<StoredCredential | null> {
  const row = await db
    .prepare(
      "SELECT id, person_id, public_key, counter, transports FROM credentials WHERE id = ?",
    )
    .bind(id)
    .first<{
      id: string;
      person_id: string;
      public_key: string;
      counter: number;
      transports: string;
    }>();
  return (
    row && {
      id: row.id,
      personId: row.person_id,
      publicKey: row.public_key,
      counter: row.counter,
      transports: JSON.parse(row.transports),
    }
  );
}

export async function touchCredential(
  db: D1Database,
  id: string,
  counter: number,
  now: string,
) {
  await db
    .prepare(
      "UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?",
    )
    .bind(counter, now, id)
    .run();
}

export async function createSession(
  db: D1Database,
  personId: string,
  now: string,
): Promise<string> {
  const token = newToken();
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(await hashToken(token), personId, now, later(now, SESSION_DAYS * DAY))
    .run();
  return token;
}

export async function sessionAccount(
  db: D1Database,
  token: string,
  now: string,
): Promise<Account | null> {
  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.email, p.admin FROM sessions s JOIN people p ON p.id = s.person_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(await hashToken(token), now)
    .first<{ id: string; name: string; email: string | null; admin: number }>();
  return row && { ...row, admin: row.admin === 1 };
}

export async function endSession(db: D1Database, token: string) {
  await db
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await hashToken(token))
    .run();
}

/** Stores a WebAuthn challenge and returns the id the browser sends back. */
export async function saveChallenge(
  db: D1Database,
  challenge: string,
  now: string,
): Promise<string> {
  const id = newToken();
  await db.batch([
    db.prepare("DELETE FROM challenges WHERE expires_at <= ?").bind(now),
    db
      .prepare(
        "INSERT INTO challenges (id, challenge, expires_at) VALUES (?, ?, ?)",
      )
      .bind(id, challenge, later(now, CHALLENGE_MS)),
  ]);
  return id;
}

/** Returns a live challenge and deletes it, so each is answered once. */
export async function takeChallenge(
  db: D1Database,
  id: string,
  now: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      "DELETE FROM challenges WHERE id = ? AND expires_at > ? RETURNING challenge",
    )
    .bind(id, now)
    .first<{ challenge: string }>();
  return row?.challenge ?? null;
}
