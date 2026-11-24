-- The one Google account whose calendar holds the events and their Meet calls.
CREATE TABLE google_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  connected_by TEXT NOT NULL REFERENCES admins (id),
  connected_at TEXT NOT NULL
);

-- An event's copy in that calendar. Saving the event form leaves these alone.
ALTER TABLE events ADD COLUMN google_event_id TEXT;
ALTER TABLE events ADD COLUMN google_event_url TEXT;
ALTER TABLE events ADD COLUMN meet_url TEXT;
