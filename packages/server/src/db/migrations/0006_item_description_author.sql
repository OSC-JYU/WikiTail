-- Two things a proper credit needs that were not stored separately: the author's
-- own caption for an item, and the creator of the work. The creator was
-- previously only folded into the prose attribution line, which cannot be
-- rendered as a structured citation.

ALTER TABLE library_items ADD COLUMN description TEXT;
ALTER TABLE library_items ADD COLUMN author TEXT;

-- Wikipedia text is collectively authored, and that is how Wikipedia itself asks
-- to be credited. Commons files each have their own author — see 0007.
UPDATE library_items SET author = 'Wikipedia contributors' WHERE source_type = 'wikipedia';
