-- Substitutes are gone: a language version either exists or the reader is told it
-- does not. Offering another language in its place blurred that, and it is the
-- author's job to provide the translation.
--
-- The column carries a REFERENCES clause, which blocks ALTER TABLE DROP COLUMN,
-- so the (small) table is rebuilt instead. Ids are preserved because
-- articles.translation_group_id points at them.

CREATE TABLE translation_groups_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO translation_groups_new (id, project_id, created_at)
SELECT id, project_id, created_at FROM translation_groups;

DROP TABLE translation_groups;
ALTER TABLE translation_groups_new RENAME TO translation_groups;
