import { sql } from "kysely";
import type { Db } from "../db";
import type { Fetch } from "../web";
import { accessToken, type GoogleCredentials } from "./oauth";

/** The connected account: one row in google_account. */
export type GoogleAccount = {
  email: string;
  refreshToken: string;
  connectedBy: string;
  connectedAt: string;
};

export async function findAccount(db: Db): Promise<GoogleAccount | null> {
  const row = await db
    .selectFrom("google_account")
    .select([
      "email",
      "refresh_token as refreshToken",
      "connected_by as connectedBy",
      "connected_at as connectedAt",
    ])
    .where("id", "=", 1)
    .executeTakeFirst();
  return row ?? null;
}

export async function saveAccount(db: Db, account: GoogleAccount) {
  await db
    .insertInto("google_account")
    .values({
      id: 1,
      email: account.email,
      refresh_token: account.refreshToken,
      connected_by: account.connectedBy,
      connected_at: account.connectedAt,
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        email: sql`excluded.email`,
        refresh_token: sql`excluded.refresh_token`,
        connected_by: sql`excluded.connected_by`,
        connected_at: sql`excluded.connected_at`,
      }),
    )
    .execute();
}

export async function deleteAccount(db: Db) {
  await db.deleteFrom("google_account").execute();
}

/** An access token for the connected account, or null when no client or account is set. */
export async function calendarToken(
  db: Db,
  fetcher: Fetch,
  creds: GoogleCredentials | null,
): Promise<string | null> {
  const account = creds && (await findAccount(db));
  return creds && account
    ? accessToken(fetcher, creds, account.refreshToken)
    : null;
}
