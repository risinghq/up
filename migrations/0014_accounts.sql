-- A person is an account. Signing in proves the email with a mailed code or
-- uses a passkey; an admin is a person with the admin flag. The old admins
-- become email-less admin people with the same id, so their passkeys keep
-- working. Sessions start over under the new cookie.
PRAGMA defer_foreign_keys = on;

-- Dropping people counts each registration as a deferred violation, and only
-- inserting rows into a table named people clears it, so the rows are copied
-- aside and inserted back rather than renamed into place.
CREATE TABLE people_old AS SELECT * FROM people;

DROP TABLE people;

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  -- NULL for an account that has not added an email yet.
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  -- Set by the first registration; an account made at /entrar has none.
  phone TEXT,
  privacy_accepted_at TEXT,
  news_opt_in_at TEXT,
  profile_id TEXT,
  admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO people (id, email, name, phone, privacy_accepted_at, news_opt_in_at, profile_id, created_at, updated_at)
SELECT id, email, name, phone, privacy_accepted_at, news_opt_in_at, profile_id, created_at, updated_at
FROM people_old;

INSERT INTO people (id, name, admin, created_at, updated_at)
SELECT id, name, 1, created_at, created_at FROM admins;

DROP TABLE people_old;

CREATE UNIQUE INDEX people_profile ON people (profile_id);

CREATE TABLE credentials_new (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

INSERT INTO credentials_new (id, person_id, public_key, counter, transports, created_at, last_used_at)
SELECT id, admin_id, public_key, counter, transports, created_at, last_used_at
FROM credentials;

DROP TABLE credentials;

ALTER TABLE credentials_new RENAME TO credentials;

CREATE INDEX credentials_person ON credentials (person_id);

DROP TABLE sessions;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE google_account_new (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  connected_by TEXT NOT NULL REFERENCES people (id),
  connected_at TEXT NOT NULL
);

INSERT INTO google_account_new SELECT id, email, refresh_token, connected_by, connected_at
FROM google_account;

DROP TABLE google_account;

ALTER TABLE google_account_new RENAME TO google_account;

DROP TABLE invites;

DROP TABLE admins;

-- One pending code per email. A code made from /cuenta carries the account
-- adding the email; a sign-in code carries none. Once a sign-in code proves
-- an email with no account, verified_at is set and code_hash holds the hash
-- of the token the new-account form sends back.
CREATE TABLE sign_in_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  person_id TEXT REFERENCES people (id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT
);
