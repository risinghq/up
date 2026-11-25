-- The public profile /p/<profile_id> that lists the events a person attended.
-- NULL until they open it from a ticket; hiding it clears it, so an old link
-- stops working.
ALTER TABLE people ADD COLUMN profile_id TEXT;
CREATE UNIQUE INDEX people_profile ON people (profile_id);
