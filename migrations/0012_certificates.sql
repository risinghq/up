-- The public id of a certificate: a checked-in ticket's, or a role's.
ALTER TABLE registrations ADD COLUMN certificate_id TEXT;

CREATE UNIQUE INDEX registrations_certificate ON registrations (certificate_id);

UPDATE registrations SET certificate_id = lower(hex(randomblob(16)))
WHERE checked_in_at IS NOT NULL;

ALTER TABLE event_roles ADD COLUMN certificate_id TEXT;

CREATE UNIQUE INDEX event_roles_certificate ON event_roles (certificate_id);

UPDATE event_roles SET certificate_id = lower(hex(randomblob(16)));
