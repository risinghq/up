-- Events, the admins who edit them at /admin, and their passkeys and sessions.
CREATE TABLE events (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  place_kind TEXT NOT NULL CHECK (place_kind IN ('venue', 'online')),
  place_name TEXT NOT NULL,
  place_address TEXT NOT NULL DEFAULT '',
  map_url TEXT,
  hosts TEXT NOT NULL DEFAULT '[]',
  capacity INTEGER,
  cover_key TEXT,
  questions TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  recording_url TEXT,
  kind TEXT NOT NULL DEFAULT 'meetup' CHECK (kind IN ('hackathon', 'taller', 'charla', 'meetup')),
  accent TEXT NOT NULL DEFAULT '#0a0a0a',
  backdrop TEXT NOT NULL DEFAULT 'plain' CHECK (backdrop IN ('plain', 'grid', 'dots', 'glow')),
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX events_status_start ON events (status, start_at);

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- A passkey. The id and public key are base64url.
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins (id),
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

-- Invites and sessions store the SHA-256 of their token, never the token.
CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- A WebAuthn challenge between the options request and the verification.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
