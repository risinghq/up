import { Kysely, type Compilable, type Generated } from "kysely";
import { D1Dialect } from "kysely-d1";
import type { Backdrop, EventStatus, Font, Kind } from "./events";
import type { Status } from "./registrations";
import type { Role } from "./roles";

/** The tables of migrations/0001_schema.sql, as Kysely reads and writes them. */
export type Schema = {
  people: PeopleTable;
  credentials: CredentialsTable;
  sessions: SessionsTable;
  challenges: ChallengesTable;
  sign_in_codes: SignInCodesTable;
  google_account: GoogleAccountTable;
  events: EventsTable;
  registrations: RegistrationsTable;
  event_roles: EventRolesTable;
};

/** SQLite has no boolean: 0 or 1. */
type Flag = 0 | 1;

export type PeopleTable = {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  privacy_accepted_at: string | null;
  news_opt_in_at: string | null;
  profile_id: string | null;
  admin: Generated<Flag>;
  created_at: string;
  updated_at: string;
};

export type CredentialsTable = {
  id: string;
  person_id: string;
  public_key: string;
  counter: Generated<number>;
  /** A JSON array of WebAuthn transports. */
  transports: Generated<string>;
  created_at: string;
  last_used_at: string | null;
};

export type SessionsTable = {
  token_hash: string;
  person_id: string;
  created_at: string;
  expires_at: string;
};

export type ChallengesTable = {
  id: string;
  challenge: string;
  expires_at: string;
};

export type SignInCodesTable = {
  email: string;
  code_hash: string;
  /** The account adding the email; null for a sign-in code. */
  person_id: string | null;
  attempts: Generated<number>;
  sent_at: string;
  expires_at: string;
  verified_at: string | null;
};

export type GoogleAccountTable = {
  id: 1;
  email: string;
  refresh_token: string;
  connected_by: string;
  connected_at: string;
};

export type EventsTable = {
  slug: string;
  title: string;
  summary: string;
  body: Generated<string>;
  kind: Generated<Kind>;
  status: Generated<EventStatus>;
  featured: Generated<Flag>;
  start_at: string;
  end_at: string;
  place_kind: "venue" | "online";
  place_name: string;
  place_address: Generated<string>;
  lat: number | null;
  lng: number | null;
  capacity: number | null;
  /** A JSON array of questions. */
  questions: Generated<string>;
  cover_key: string | null;
  accent: Generated<string>;
  backdrop: Generated<Backdrop>;
  font: Generated<Font>;
  recording_url: string | null;
  google_event_id: string | null;
  google_event_url: string | null;
  meet_url: string | null;
  created_at: string;
  updated_at: string;
};

export type RegistrationsTable = {
  id: string;
  event_slug: string;
  person_id: string;
  number: number;
  status: Status;
  /** A JSON object of answers by question id. */
  answers: Generated<string>;
  share_id: string | null;
  certificate_id: string | null;
  created_at: string;
  cancelled_at: string | null;
  checked_in_at: string | null;
  reminded_at: string | null;
  resent_at: string | null;
};

export type EventRolesTable = {
  id: Generated<number>;
  event_slug: string;
  person_id: string;
  role: Role;
  position: number;
  certificate_id: string;
};

/** The site's database: typed queries over D1, and D1's atomic batch. */
export class Db extends Kysely<Schema> {
  readonly #d1: D1Database;

  constructor(d1: D1Database) {
    super({ dialect: new D1Dialect({ database: d1 }) });
    this.#d1 = d1;
  }

  /** Runs the queries in one D1 batch: all of them commit, or none. */
  async batch(queries: Compilable[]): Promise<void> {
    const statements = queries.map((query) => {
      const { sql, parameters } = query.compile();
      return this.#d1.prepare(sql).bind(...parameters);
    });
    await this.#d1.batch(statements);
  }
}
