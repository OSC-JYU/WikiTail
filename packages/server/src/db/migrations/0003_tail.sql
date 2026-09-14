CREATE TABLE tail_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id),
  library_item_id INTEGER NOT NULL REFERENCES library_items(id),
  commentary TEXT,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tail_entries_article_position ON tail_entries(article_id, position);
