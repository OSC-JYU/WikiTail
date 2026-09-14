import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { runMigrations } from './migrate.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run migrations eagerly here (not in index.ts) so they execute before any
// repository module's top-level db.prepare() calls, regardless of import order.
runMigrations(db);
