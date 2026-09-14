CREATE TABLE local_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  disk_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'audio', 'video', 'other')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE library_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('wikipedia', 'wikidata', 'commons', 'finna', 'local_upload')),
  external_id TEXT,
  external_url TEXT,
  source_revision TEXT,
  title TEXT NOT NULL,
  snapshot_html TEXT,
  snapshot_json TEXT,
  local_file_id INTEGER REFERENCES local_files(id),
  license_name TEXT,
  license_url TEXT,
  attribution_text TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  imported_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_library_items_owner_id ON library_items(owner_id);
CREATE INDEX idx_library_items_source ON library_items(source_type, external_id);
