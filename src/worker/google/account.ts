import type { Fetch } from "../web";
import { accessToken, type GoogleCredentials } from "./oauth";

/** The connected account: one row in google_account. */
export type GoogleAccount = {
  email: string;
  refreshToken: string;
  connectedBy: string;
  connectedAt: string;
};

type AccountRow = {
  email: string;
  refresh_token: string;
  connected_by: string;
  connected_at: string;
};

export async function findAccount(
  db: D1Database,
): Promise<GoogleAccount | null> {
  const row = await db
    .prepare("SELECT * FROM google_account WHERE id = 1")
    .first<AccountRow>();

  return (
    row && {
      email: row.email,
      refreshToken: row.refresh_token,
      connectedBy: row.connected_by,
      connectedAt: row.connected_at,
    }
  );
}

export async function saveAccount(db: D1Database, account: GoogleAccount) {
  await db
    .prepare(
      `INSERT INTO google_account (id, email, refresh_token, connected_by, connected_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET email = excluded.email,
         refresh_token = excluded.refresh_token,
         connected_by = excluded.connected_by,
         connected_at = excluded.connected_at`,
    )
    .bind(
      account.email,
      account.refreshToken,
      account.connectedBy,
      account.connectedAt,
    )
    .run();
}

export async function deleteAccount(db: D1Database) {
  await db.prepare("DELETE FROM google_account").run();
}

/** An access token for the connected account, or null when no client or account is set. */
export async function calendarToken(
  db: D1Database,
  fetcher: Fetch,
  creds: GoogleCredentials | null,
): Promise<string | null> {
  const account = creds && (await findAccount(db));
  return creds && account
    ? accessToken(fetcher, creds, account.refreshToken)
    : null;
}
