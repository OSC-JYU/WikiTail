-- Languages: projects declare a set, articles belong to one, and language
-- versions of an article are grouped so a missing one can fall back.

CREATE TABLE project_languages (
  project_id INTEGER NOT NULL REFERENCES projects(id),
  language TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (project_id, language)
);

CREATE TABLE translation_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  -- NULL: show the "translation missing" invitation.
  -- Set:  show this article instead, marked as being in another language.
  fallback_article_id INTEGER REFERENCES articles(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every project predating languages gets 'en' as its single language. There is
-- no better signal available, and this runs against dev data only.
INSERT INTO project_languages (project_id, language, position)
SELECT id, 'en', 0 FROM projects;

-- One group per existing article, reusing the article id so the backfill below
-- can map them without a temporary column.
INSERT INTO translation_groups (id, project_id)
SELECT id, project_id FROM articles;

-- articles is rebuilt rather than altered: UNIQUE(project_id, slug) has to become
-- UNIQUE(project_id, language, slug), and SQLite cannot add a NOT NULL column
-- carrying a REFERENCES clause.
CREATE TABLE articles_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  translation_group_id INTEGER NOT NULL REFERENCES translation_groups(id),
  body_markdown TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, language, slug),
  UNIQUE (translation_group_id, language)
);

INSERT INTO articles_new (
  id, project_id, slug, title, language, translation_group_id,
  body_markdown, status, created_by, created_at, updated_at
)
SELECT id, project_id, slug, title, 'en', id,
       body_markdown, status, created_by, created_at, updated_at
FROM articles;

DROP TABLE articles;
ALTER TABLE articles_new RENAME TO articles;

CREATE INDEX idx_articles_project_id ON articles(project_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_translation_group ON articles(translation_group_id);

-- Imported items carry their own language, and concept_id ties the language
-- versions of one topic together (e.g. 'wikidata:Q185187').
ALTER TABLE library_items ADD COLUMN language TEXT;
ALTER TABLE library_items ADD COLUMN concept_id TEXT;

CREATE INDEX idx_library_items_concept ON library_items(concept_id, language);

-- Backfill the language already encoded in existing Wikipedia ids ('en:Watermill').
UPDATE library_items
SET language = substr(external_id, 1, instr(external_id, ':') - 1)
WHERE source_type = 'wikipedia' AND instr(external_id, ':') > 1;
