-- A venue's spot on the map, in degrees. Both or neither.
ALTER TABLE events ADD COLUMN lat REAL;
ALTER TABLE events ADD COLUMN lng REAL;
