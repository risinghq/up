-- A person's part in an event. The email ties the event to that person's
-- profile and is never shown. A rename or a delete of the event carries its
-- roles along.
CREATE TABLE event_roles (
  id INTEGER PRIMARY KEY,
  event_slug TEXT NOT NULL REFERENCES events (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('organiza', 'ponente', 'mentor', 'jurado', 'voluntario')),
  position INTEGER NOT NULL,
  UNIQUE (event_slug, role, email)
);

CREATE INDEX event_roles_email ON event_roles (email);

-- The hosts become the event's organizers. events.hosts stays until the
-- Worker that reads it is gone.
INSERT OR IGNORE INTO event_roles (event_slug, name, email, role, position)
SELECT e.slug, json_extract(h.value, '$.name'), json_extract(h.value, '$.email'), 'organiza', h.key
FROM events e, json_each(e.hosts) h;
