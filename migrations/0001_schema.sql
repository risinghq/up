CREATE TABLE people (
  id TEXT PRIMARY KEY,
  -- NULL for an account that has not added an email yet.
  email TEXT UNIQUE,
  name TEXT NOT NULL,
  -- Set by the first registration; an account made at sign-in has none.
  phone TEXT,
  privacy_accepted_at TEXT,
  news_opt_in_at TEXT,
  profile_id TEXT UNIQUE,
  admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX credentials_person ON credentials (person_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE sign_in_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  person_id TEXT REFERENCES people (id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE TABLE google_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  connected_by TEXT NOT NULL REFERENCES people (id),
  connected_at TEXT NOT NULL
);

CREATE TABLE events (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'meetup' CHECK (kind IN ('hackathon', 'workshop', 'talk', 'meetup')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  featured INTEGER NOT NULL DEFAULT 0,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  place_kind TEXT NOT NULL CHECK (place_kind IN ('venue', 'online')),
  place_name TEXT NOT NULL,
  place_address TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  capacity INTEGER,
  questions TEXT NOT NULL DEFAULT '[]',
  cover_key TEXT,
  accent TEXT NOT NULL DEFAULT '#0a0a0a',
  backdrop TEXT NOT NULL DEFAULT 'plain' CHECK (backdrop IN ('plain', 'grid', 'dots', 'glow')),
  font TEXT NOT NULL DEFAULT 'sans' CHECK (font IN ('sans', 'pixel', 'mono', 'serif')),
  recording_url TEXT,
  google_event_id TEXT,
  google_event_url TEXT,
  meet_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX events_status_start ON events (status, start_at);

CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  event_slug TEXT NOT NULL REFERENCES events (slug) ON UPDATE CASCADE,
  person_id TEXT NOT NULL REFERENCES people (id),
  number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('going', 'waitlist', 'cancelled')),
  answers TEXT NOT NULL DEFAULT '{}',
  share_id TEXT UNIQUE,
  certificate_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  checked_in_at TEXT,
  reminded_at TEXT,
  resent_at TEXT,
  UNIQUE (event_slug, person_id),
  UNIQUE (event_slug, number)
);

CREATE INDEX registrations_event_status ON registrations (event_slug, status);

CREATE TABLE event_roles (
  id INTEGER PRIMARY KEY,
  event_slug TEXT NOT NULL REFERENCES events (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('organizer', 'speaker', 'mentor', 'judge', 'volunteer')),
  position INTEGER NOT NULL,
  certificate_id TEXT NOT NULL UNIQUE,
  UNIQUE (event_slug, role, person_id)
);

CREATE INDEX event_roles_person ON event_roles (person_id);
