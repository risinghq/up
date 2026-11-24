-- The typeface of an event's title, as Luma's font_title.
ALTER TABLE events ADD COLUMN font TEXT NOT NULL DEFAULT 'sans' CHECK (font IN ('sans', 'pixel', 'mono', 'serif'));
