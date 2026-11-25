-- When the day-before reminder went out, and when a repeat registration last
-- resent the ticket link. A resend waits out a cooldown, so a stranger who
-- types someone's email cannot flood their inbox.
ALTER TABLE registrations ADD COLUMN reminded_at TEXT;
ALTER TABLE registrations ADD COLUMN resent_at TEXT;
