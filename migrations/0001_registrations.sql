-- A person is one email. Name and phone hold the latest values they gave.
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  -- When they accepted the privacy policy, and when they opted in to
  -- WhatsApp news (NULL when they did not).
  privacy_accepted_at TEXT NOT NULL,
  news_opt_in_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- id is the ticket token in /entrada/<id>; it is the registrant's only key.
CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  event_slug TEXT NOT NULL,
  person_id TEXT NOT NULL REFERENCES people (id),
  number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('going', 'waitlist', 'cancelled')),
  answers TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  checked_in_at TEXT,
  UNIQUE (event_slug, person_id),
  UNIQUE (event_slug, number)
);

CREATE INDEX registrations_event_status ON registrations (event_slug, status);
