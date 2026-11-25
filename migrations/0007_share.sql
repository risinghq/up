-- The public "voy" link of a ticket, /<slug>/voy/<share_id>. NULL until the
-- holder shares it; cancelling clears it. It is not the ticket token, which
-- stays secret.
ALTER TABLE registrations ADD COLUMN share_id TEXT;
CREATE UNIQUE INDEX registrations_share ON registrations (share_id);
