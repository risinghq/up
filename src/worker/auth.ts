import { toAccount, type Account } from "./accounts";
import type { Db } from "./db";
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
  db: Db,
  personId: string,
  credential: NewCredential,
  now: string,
) {
  await db
    .insertInto("credentials")
    .values({
      id: credential.id,
      person_id: personId,
      public_key: credential.publicKey,
      counter: credential.counter,
      transports: JSON.stringify(credential.transports),
      created_at: now,
    })
    .execute();
}

export async function listPasskeys(
  db: Db,
  personId: string,
): Promise<Passkey[]> {
  return db
    .selectFrom("credentials")
    .select(["id", "created_at as createdAt", "last_used_at as lastUsedAt"])
    .where("person_id", "=", personId)
    .orderBy("created_at")
    .execute();
}

/** Deletes one of the account's passkeys; another account's id does nothing. */
export async function removeCredential(db: Db, personId: string, id: string) {
  await db
    .deleteFrom("credentials")
    .where("id", "=", id)
    .where("person_id", "=", personId)
    .execute();
}

export async function findCredential(
  db: Db,
  id: string,
): Promise<StoredCredential | null> {
  const row = await db
    .selectFrom("credentials")
    .select(["id", "person_id", "public_key", "counter", "transports"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return null;

  return {
    id: row.id,
    personId: row.person_id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: JSON.parse(row.transports),
  };
}

export async function touchCredential(
  db: Db,
  id: string,
  counter: number,
  now: string,
) {
  await db
    .updateTable("credentials")
    .set({ counter, last_used_at: now })
    .where("id", "=", id)
    .execute();
}

export async function createSession(
  db: Db,
  personId: string,
  now: string,
): Promise<string> {
  const token = newToken();
  await db
    .insertInto("sessions")
    .values({
      token_hash: await hashToken(token),
      person_id: personId,
      created_at: now,
      expires_at: later(now, SESSION_DAYS * DAY),
    })
    .execute();
  return token;
}

export async function sessionAccount(
  db: Db,
  token: string,
  now: string,
): Promise<Account | null> {
  const row = await db
    .selectFrom("sessions as s")
    .innerJoin("people as p", "p.id", "s.person_id")
    .select(["p.id", "p.name", "p.email", "p.admin"])
    .where("s.token_hash", "=", await hashToken(token))
    .where("s.expires_at", ">", now)
    .executeTakeFirst();
  return row ? toAccount(row) : null;
}

export async function endSession(db: Db, token: string) {
  await db
    .deleteFrom("sessions")
    .where("token_hash", "=", await hashToken(token))
    .execute();
}

/** Stores a WebAuthn challenge and returns the id the browser sends back. */
export async function saveChallenge(
  db: Db,
  challenge: string,
  now: string,
): Promise<string> {
  const id = newToken();
  await db.batch([
    db.deleteFrom("challenges").where("expires_at", "<=", now),
    db
      .insertInto("challenges")
      .values({ id, challenge, expires_at: later(now, CHALLENGE_MS) }),
  ]);
  return id;
}

/** Returns a live challenge and deletes it, so each is answered once. */
export async function takeChallenge(
  db: Db,
  id: string,
  now: string,
): Promise<string | null> {
  const row = await db
    .deleteFrom("challenges")
    .where("id", "=", id)
    .where("expires_at", ">", now)
    .returning("challenge")
    .executeTakeFirst();
  return row?.challenge ?? null;
}
