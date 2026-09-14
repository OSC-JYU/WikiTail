-- The library belongs to an article, not to a person. Several people may work on
-- the same project, so material gathered for an article should be visible to all
-- of them rather than trapped in whoever happened to import it.
--
-- It hangs off the translation group rather than a single article row, so the
-- language versions of one article share it. That is what lets a tail entry
-- resolve to the reader's language, and what lets a copied tail keep working.

ALTER TABLE library_items ADD COLUMN translation_group_id INTEGER REFERENCES translation_groups(id);

-- 1. Exact: items a tail already points at.
UPDATE library_items
SET translation_group_id = (
  SELECT a.translation_group_id
  FROM tail_entries t JOIN articles a ON a.id = t.article_id
  WHERE t.library_item_id = library_items.id
  ORDER BY a.id LIMIT 1
)
WHERE translation_group_id IS NULL;

-- 2. Exact: items embedded in an article body.
UPDATE library_items
SET translation_group_id = (
  SELECT translation_group_id FROM articles
  WHERE body_markdown LIKE '%[[library:' || library_items.id || '|%'
     OR body_markdown LIKE '%[[library:' || library_items.id || ']]%'
  ORDER BY id LIMIT 1
)
WHERE translation_group_id IS NULL;

-- 3. Exact: a sibling language version of the same concept was placed above, and
--    siblings are only ever imported together.
UPDATE library_items
SET translation_group_id = (
  SELECT sibling.translation_group_id FROM library_items sibling
  WHERE sibling.concept_id = library_items.concept_id
    AND sibling.concept_id IS NOT NULL
    AND sibling.translation_group_id IS NOT NULL
  LIMIT 1
)
WHERE translation_group_id IS NULL AND concept_id IS NOT NULL;

-- 4. Best guess for the rest: whichever article existed most recently when the
--    item was imported — material is gathered while working on something. These
--    are imports that were never used; uploads are irreplaceable, so nothing is
--    deleted here even when the guess is poor.
UPDATE library_items
SET translation_group_id = (
  SELECT id FROM translation_groups
  WHERE created_at <= library_items.imported_at
  ORDER BY created_at DESC, id DESC LIMIT 1
)
WHERE translation_group_id IS NULL;

-- 5. Anything imported before any article existed goes to the earliest group.
UPDATE library_items
SET translation_group_id = (SELECT id FROM translation_groups ORDER BY id LIMIT 1)
WHERE translation_group_id IS NULL;

DELETE FROM library_items WHERE translation_group_id IS NULL;

-- Rebuild to make the column NOT NULL and to drop owner_id: ownership of an item
-- is now the article's, and imported_by already records who added it.
CREATE TABLE library_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_group_id INTEGER NOT NULL REFERENCES translation_groups(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('wikipedia', 'wikidata', 'commons', 'finna', 'local_upload')),
  external_id TEXT,
  external_url TEXT,
  source_revision TEXT,
  language TEXT,
  concept_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT,
  snapshot_html TEXT,
  snapshot_json TEXT,
  local_file_id INTEGER REFERENCES local_files(id),
  license_name TEXT,
  license_url TEXT,
  attribution_text TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  imported_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- The same source item cannot be imported twice into one article library.
  -- Uploads have a NULL external_id, which SQLite treats as always distinct.
  UNIQUE (translation_group_id, source_type, external_id)
);

INSERT INTO library_items_new (
  id, translation_group_id, source_type, external_id, external_url, source_revision, language,
  concept_id, title, description, author, snapshot_html, snapshot_json, local_file_id,
  license_name, license_url, attribution_text, imported_at, imported_by, created_at
)
SELECT
  id, translation_group_id, source_type, external_id, external_url, source_revision, language,
  concept_id, title, description, author, snapshot_html, snapshot_json, local_file_id,
  license_name, license_url, attribution_text, imported_at, imported_by, created_at
FROM library_items;

DROP TABLE library_items;
ALTER TABLE library_items_new RENAME TO library_items;

CREATE INDEX idx_library_items_group ON library_items(translation_group_id);
CREATE INDEX idx_library_items_source ON library_items(source_type, external_id);
CREATE INDEX idx_library_items_concept ON library_items(concept_id, language);
