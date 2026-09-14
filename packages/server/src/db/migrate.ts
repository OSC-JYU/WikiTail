import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { logger } from '../lib/logger.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => (row as { name: string }).name),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((file) => !applied.has(file));
  if (pending.length === 0) return;

  // SQLite cannot alter constraints in place, so migrations may rebuild a table
  // (create → copy → drop → rename). That trips foreign keys pointing at the old
  // table, and `PRAGMA foreign_keys` is a no-op inside a transaction — so it has
  // to be toggled out here, around the whole run.
  db.pragma('foreign_keys = OFF');
  try {
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      logger.info(`Applying migration ${file}`);
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
      })();

      const violations = db.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) {
        throw new Error(
          `Migration ${file} left ${violations.length} foreign key violation(s): ${JSON.stringify(violations.slice(0, 5))}`,
        );
      }
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
}
