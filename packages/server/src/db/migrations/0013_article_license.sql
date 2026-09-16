-- Articles get a licence too, not just library items — an author's own
-- writing needs the same "here is what you may do with this" statement as an
-- uploaded photo. Defaults to CC BY: attribution-only is the permissive,
-- expected case for a wiki project's own text.
ALTER TABLE articles ADD COLUMN license_id TEXT NOT NULL DEFAULT 'cc-by-4.0';
