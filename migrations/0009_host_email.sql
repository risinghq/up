-- A host becomes {"name", "email"?}; the email ties the event to the host's
-- profile and is never shown.
UPDATE events
SET hosts = (
  SELECT json_group_array(json_object('name', value)) FROM json_each(events.hosts)
)
WHERE EXISTS (SELECT 1 FROM json_each(events.hosts) WHERE type = 'text');
