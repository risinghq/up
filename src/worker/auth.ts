import { hashToken, newToken } from "./tokens";

export type Admin = { id: string; name: string };

const DAY = 24 * 60 * 60 * 1000;
export const INVITE_DAYS = 7;
export const SESSION_DAYS = 30;
const CHALLENGE_MS = 5 * 60 * 1000;

const later = (now: string, ms: number) =>
  new Date(Date.parse(now) + ms).toISOString();

/** Creates a one-time invite and returns its token. */
export async function createInvite(
  db: D1Database,
  name: string,
  now: string,
): Promise<string> {
  const token = newToken();
  await db
    .prepare(
      "INSERT INTO invites (token_hash, name, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(await hashToken(token), name, now, later(now, INVITE_DAYS * DAY))
    .run();
  return token;
}

/** The name on an unused, unexpired invite. */
export async function findInvite(
  db: D1Database,
  token: string,
  now: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT name FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
    )
    .bind(await hashToken(token), now)
    .first<{ name: string }>();
  return row?.name ?? null;
}

export type NewCredential = {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
};

/**
 * Spends an invite on a new admin and their first passkey. Returns null when
 * the invite was spent first, so one link makes at most one admin.
 */
export async function acceptInvite(
  db: D1Database,
  token: string,
  credential: NewCredential,
  now: string,
): Promise<Admin | null> {
  const hash = await hashToken(token);
  const spent = await db
    .prepare(
      `UPDATE invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       RETURNING name`,
    )
    .bind(now, hash, now)
    .first<{ name: string }>();
  if (!spent) return null;
  const admin = { id: crypto.randomUUID(), name: spent.name };
  await db.batch([
    db
      .prepare("INSERT INTO admins (id, name, created_at) VALUES (?, ?, ?)")
      .bind(admin.id, admin.name, now),
    db
      .prepare(
        `INSERT INTO credentials (id, admin_id, public_key, counter, transports, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        credential.id,
        admin.id,
        credential.publicKey,
        credential.counter,
        JSON.stringify(credential.transports),
        now,
      ),
  ]);
  return admin;
}

export type StoredCredential = NewCredential & { adminId: string };

export async function findCredential(
  db: D1Database,
  id: string,
): Promise<StoredCredential | null> {
  const row = await db
    .prepare(
      "SELECT id, admin_id, public_key, counter, transports FROM credentials WHERE id = ?",
    )
    .bind(id)
    .first<{
      id: string;
      admin_id: string;
      public_key: string;
      counter: number;
      transports: string;
    }>();
  return (
    row && {
      id: row.id,
      adminId: row.admin_id,
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
  adminId: string,
  now: string,
): Promise<string> {
  const token = newToken();
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(await hashToken(token), adminId, now, later(now, SESSION_DAYS * DAY))
    .run();
  return token;
}

export async function sessionAdmin(
  db: D1Database,
  token: string,
  now: string,
): Promise<Admin | null> {
  return db
    .prepare(
      `SELECT a.id, a.name FROM sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(await hashToken(token), now)
    .first<Admin>();
}

export async function endSession(db: D1Database, token: string) {
  await db
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await hashToken(token))
    .run();
}

export async function listAdmins(db: D1Database): Promise<Admin[]> {
  const { results } = await db
    .prepare("SELECT id, name FROM admins ORDER BY created_at")
    .all<Admin>();
  return results;
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
