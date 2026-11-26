-- A voluntario's door link: the hash of a token that lets its holder check
-- people in at that one event.
ALTER TABLE event_roles ADD COLUMN door_hash TEXT;

CREATE UNIQUE INDEX event_roles_door ON event_roles (door_hash);

ALTER TABLE events DROP COLUMN hosts;
