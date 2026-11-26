/**
 * A person who can sign in. Every person is one: a registration makes the
 * person, and proving the email opens it. `email` is null only for an admin
 * carried over from before accounts, until they add one.
 */
export type Account = {
  id: string;
  name: string;
  email: string | null;
  admin: boolean;
};

type AccountRow = {
  id: string;
  name: string;
  email: string | null;
  admin: number;
};

const toAccount = (row: AccountRow): Account => ({
  ...row,
  admin: row.admin === 1,
});

const columns = "id, name, email, admin";

export async function findAccount(
  db: D1Database,
  id: string,
): Promise<Account | null> {
  const row = await db
    .prepare(`SELECT ${columns} FROM people WHERE id = ?`)
    .bind(id)
    .first<AccountRow>();
  return row && toAccount(row);
}

export async function accountByEmail(
  db: D1Database,
  email: string,
): Promise<Account | null> {
  const row = await db
    .prepare(`SELECT ${columns} FROM people WHERE email = ?`)
    .bind(email)
    .first<AccountRow>();
  return row && toAccount(row);
}

/** A new account for a proven email that had none. */
export async function createAccount(
  db: D1Database,
  input: { email: string; name: string },
  now: string,
): Promise<Account> {
  const account = { id: crypto.randomUUID(), ...input, admin: false };
  await db
    .prepare(
      `INSERT INTO people (id, email, name, privacy_accepted_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?4, ?4)`,
    )
    .bind(account.id, account.email, account.name, now)
    .run();
  return account;
}

export type EmailChange = "changed" | "taken";

/**
 * Gives the account a proven email. When another person holds it and this
 * account has no email yet, that person folds into this account: proving the
 * email shows both are the same person, and an account without an email holds
 * no registrations to collide. An account with an email cannot take one that
 * belongs to another person.
 */
export async function claimEmail(
  db: D1Database,
  account: Account,
  email: string,
  now: string,
): Promise<EmailChange> {
  const holder = await accountByEmail(db, email);
  if (holder?.id === account.id) return "changed";

  if (!holder) {
    await db
      .prepare("UPDATE people SET email = ?, updated_at = ? WHERE id = ?")
      .bind(email, now, account.id)
      .run();
    return "changed";
  }

  if (account.email) return "taken";

  const move = (table: string, column: string) =>
    db
      .prepare(`UPDATE ${table} SET ${column} = ?1 WHERE ${column} = ?2`)
      .bind(account.id, holder.id);

  await db.batch([
    move("registrations", "person_id"),
    move("credentials", "person_id"),
    move("sessions", "person_id"),
    move("google_account", "connected_by"),
    // A role both already hold stays with the holder and goes with it.
    db
      .prepare(
        "UPDATE OR IGNORE event_roles SET person_id = ?1 WHERE person_id = ?2",
      )
      .bind(account.id, holder.id),
    db
      .prepare(
        `UPDATE people SET
           phone = old.phone,
           privacy_accepted_at = COALESCE(people.privacy_accepted_at, old.privacy_accepted_at),
           news_opt_in_at = old.news_opt_in_at,
           admin = MAX(people.admin, old.admin),
           created_at = MIN(people.created_at, old.created_at),
           updated_at = ?3
         FROM (SELECT * FROM people WHERE id = ?2) AS old
         WHERE people.id = ?1`,
      )
      .bind(account.id, holder.id, now),
    db.prepare("DELETE FROM people WHERE id = ?").bind(holder.id),
    db
      .prepare("UPDATE people SET email = ? WHERE id = ?")
      .bind(email, account.id),
  ]);
  return "changed";
}

/**
 * Up to `limit` people whose name or email contains `query`, ignoring case,
 * those with an email first.
 */
export async function searchAccounts(
  db: D1Database,
  query: string,
  limit = 8,
): Promise<Account[]> {
  const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
  const { results } = await db
    .prepare(
      `SELECT ${columns} FROM people
       WHERE lower(name) LIKE ?1 ESCAPE '\\' OR email LIKE ?1 ESCAPE '\\'
       ORDER BY email IS NULL, name LIMIT ?2`,
    )
    .bind(pattern, limit)
    .all<AccountRow>();
  return results.map(toAccount);
}

/** The admins, oldest first. */
export async function listAdmins(db: D1Database): Promise<Account[]> {
  const { results } = await db
    .prepare(
      `SELECT ${columns} FROM people WHERE admin = 1 ORDER BY created_at`,
    )
    .all<AccountRow>();
  return results.map(toAccount);
}

export type AdminChange = "done" | "unknown" | "self";

/** Makes the account behind `email` an admin. */
export async function grantAdmin(
  db: D1Database,
  email: string,
  now: string,
): Promise<AdminChange> {
  const row = await db
    .prepare(
      "UPDATE people SET admin = 1, updated_at = ? WHERE email = ? RETURNING id",
    )
    .bind(now, email)
    .first<{ id: string }>();
  return row ? "done" : "unknown";
}

/**
 * Takes the admin flag from `id`. An admin cannot remove themself, so the
 * site always keeps at least one.
 */
export async function revokeAdmin(
  db: D1Database,
  by: Account,
  id: string,
  now: string,
): Promise<AdminChange> {
  if (id === by.id) return "self";
  await db
    .prepare("UPDATE people SET admin = 0, updated_at = ? WHERE id = ?")
    .bind(now, id)
    .run();
  return "done";
}
