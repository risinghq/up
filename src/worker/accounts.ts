import { sql, type Selectable } from "kysely";
import type { Db, PeopleTable } from "./db";

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

type AccountRow = Pick<
  Selectable<PeopleTable>,
  "id" | "name" | "email" | "admin"
>;

export const toAccount = (row: AccountRow): Account => ({
  ...row,
  admin: row.admin === 1,
});

const columns = ["id", "name", "email", "admin"] as const;

export async function findAccount(db: Db, id: string): Promise<Account | null> {
  const row = await db
    .selectFrom("people")
    .select(columns)
    .where("id", "=", id)
    .executeTakeFirst();
  return row ? toAccount(row) : null;
}

export async function accountByEmail(
  db: Db,
  email: string,
): Promise<Account | null> {
  const row = await db
    .selectFrom("people")
    .select(columns)
    .where("email", "=", email)
    .executeTakeFirst();
  return row ? toAccount(row) : null;
}

/** A new account for a proven email that had none. */
export async function createAccount(
  db: Db,
  input: { email: string; name: string },
  now: string,
): Promise<Account> {
  const account = { id: crypto.randomUUID(), ...input, admin: false };
  await db
    .insertInto("people")
    .values({
      id: account.id,
      email: account.email,
      name: account.name,
      privacy_accepted_at: now,
      created_at: now,
      updated_at: now,
    })
    .execute();
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
  db: Db,
  account: Account,
  email: string,
  now: string,
): Promise<EmailChange> {
  const holder = await accountByEmail(db, email);
  if (holder?.id === account.id) return "changed";

  if (!holder) {
    await db
      .updateTable("people")
      .set({ email, updated_at: now })
      .where("id", "=", account.id)
      .execute();
    return "changed";
  }

  if (account.email) return "taken";

  await db.batch([
    db
      .updateTable("registrations")
      .set({ person_id: account.id })
      .where("person_id", "=", holder.id),
    db
      .updateTable("credentials")
      .set({ person_id: account.id })
      .where("person_id", "=", holder.id),
    db
      .updateTable("sessions")
      .set({ person_id: account.id })
      .where("person_id", "=", holder.id),
    db
      .updateTable("google_account")
      .set({ connected_by: account.id })
      .where("connected_by", "=", holder.id),
    // A role both already hold stays with the holder and goes with it.
    db
      .updateTable("event_roles as r")
      .set({ person_id: account.id })
      .where("r.person_id", "=", holder.id)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("event_roles as mine")
              .select("mine.id")
              .where("mine.person_id", "=", account.id)
              .whereRef("mine.event_slug", "=", "r.event_slug")
              .whereRef("mine.role", "=", "r.role"),
          ),
        ),
      ),
    db
      .updateTable("people")
      .from(
        db
          .selectFrom("people")
          .selectAll()
          .where("id", "=", holder.id)
          .as("old"),
      )
      .set((eb) => ({
        phone: eb.ref("old.phone"),
        privacy_accepted_at: sql`coalesce(people.privacy_accepted_at, old.privacy_accepted_at)`,
        news_opt_in_at: eb.ref("old.news_opt_in_at"),
        admin: sql`max(people.admin, old.admin)`,
        created_at: sql`min(people.created_at, old.created_at)`,
        updated_at: now,
      }))
      .where("people.id", "=", account.id),
    db.deleteFrom("people").where("id", "=", holder.id),
    db.updateTable("people").set({ email }).where("id", "=", account.id),
  ]);
  return "changed";
}

/**
 * Up to `limit` people whose name or email contains `query`, ignoring case,
 * those with an email first.
 */
export async function searchAccounts(
  db: Db,
  query: string,
  limit = 8,
): Promise<Account[]> {
  const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .selectFrom("people")
    .select(columns)
    .where(
      sql<boolean>`lower(name) like ${pattern} escape '\\' or email like ${pattern} escape '\\'`,
    )
    .orderBy(sql`email is null`)
    .orderBy("name")
    .limit(limit)
    .execute();
  return rows.map(toAccount);
}

/** The admins, oldest first. */
export async function listAdmins(db: Db): Promise<Account[]> {
  const rows = await db
    .selectFrom("people")
    .select(columns)
    .where("admin", "=", 1)
    .orderBy("created_at")
    .execute();
  return rows.map(toAccount);
}

export type AdminChange = "done" | "unknown" | "self";

/** Makes the account behind `email` an admin. */
export async function grantAdmin(
  db: Db,
  email: string,
  now: string,
): Promise<AdminChange> {
  const row = await db
    .updateTable("people")
    .set({ admin: 1, updated_at: now })
    .where("email", "=", email)
    .returning("id")
    .executeTakeFirst();
  return row ? "done" : "unknown";
}

/**
 * Takes the admin flag from `id`. An admin cannot remove themself, so the
 * site always keeps at least one.
 */
export async function revokeAdmin(
  db: Db,
  by: Account,
  id: string,
  now: string,
): Promise<AdminChange> {
  if (id === by.id) return "self";
  await db
    .updateTable("people")
    .set({ admin: 0, updated_at: now })
    .where("id", "=", id)
    .execute();
  return "done";
}
