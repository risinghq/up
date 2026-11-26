-- A role points at a person, so the team is made of accounts: the name and
-- the email come from people, and a voluntario opens the door by signing
-- in, so door links go. A role's email with no person becomes one; a role
-- without an email becomes an email-less person per name, whom an admin can
-- replace with an account.
INSERT INTO people (id, email, name, created_at, updated_at)
SELECT lower(hex(randomblob(16))), r.email, MIN(r.name),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM event_roles r
WHERE r.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM people p WHERE p.email = r.email)
GROUP BY r.email;

CREATE TABLE role_people (name TEXT PRIMARY KEY, person_id TEXT NOT NULL);

INSERT INTO role_people (name, person_id)
SELECT name, lower(hex(randomblob(16))) FROM event_roles
WHERE email IS NULL GROUP BY name;

INSERT INTO people (id, name, created_at, updated_at)
SELECT person_id, name,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM role_people;

CREATE TABLE event_roles_new (
  id INTEGER PRIMARY KEY,
  event_slug TEXT NOT NULL REFERENCES events (slug) ON UPDATE CASCADE ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('organiza', 'ponente', 'mentor', 'jurado', 'voluntario')),
  position INTEGER NOT NULL,
  certificate_id TEXT NOT NULL UNIQUE,
  UNIQUE (event_slug, role, person_id)
);

INSERT OR IGNORE INTO event_roles_new (id, event_slug, person_id, role, position, certificate_id)
SELECT r.id, r.event_slug,
       COALESCE((SELECT p.id FROM people p WHERE p.email = r.email),
                (SELECT rp.person_id FROM role_people rp WHERE rp.name = r.name AND r.email IS NULL)),
       r.role, r.position, COALESCE(r.certificate_id, lower(hex(randomblob(16))))
FROM event_roles r;

DROP TABLE role_people;

DROP TABLE event_roles;

ALTER TABLE event_roles_new RENAME TO event_roles;

CREATE INDEX event_roles_person ON event_roles (person_id);
