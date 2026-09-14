import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const authMode = env('AUTH_MODE', process.env.NODE_ENV === 'production' ? 'header' : 'dev') as
  | 'header'
  | 'dev';
const devUserEmail = env('DEV_USER_EMAIL', 'dev@wikitail.local');
const rawAdminEmails = env('ADMIN_EMAILS', '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  port: Number(env('PORT', '3000')),
  authMode,
  devUserEmail,
  // In dev mode, the fixed dev user defaults to admin so the full flow is testable
  // without extra setup, unless ADMIN_EMAILS was explicitly set.
  adminEmails:
    authMode === 'dev' && rawAdminEmails.length === 0
      ? [devUserEmail.toLowerCase()]
      : rawAdminEmails,
  dbPath: path.resolve(serverRoot, env('DB_PATH', 'data/wikitail.db')),
  uploadsDir: path.resolve(serverRoot, env('UPLOADS_DIR', 'uploads')),
  clientDistDir: path.resolve(serverRoot, '../client/dist'),
  /** Language for projects created without one, and for source searches with no context. */
  defaultLanguage: env('DEFAULT_LANGUAGE', 'en'),
  wikipediaUserAgent: env(
    'WIKIPEDIA_USER_AGENT',
    'Wikitail/0.1 (local dev; contact: admin@wikitail.local)',
  ),
  /**
   * Commons originals run to many megabytes (8MB for a single photo). A snapshot
   * only has to look right on a page, so a scaled rendering is imported and the
   * original stays one click away at the source.
   */
  commonsImageWidth: Number(env('COMMONS_IMAGE_WIDTH', '1600')),
  maxImportBytes: Number(env('MAX_IMPORT_BYTES', String(25 * 1024 * 1024))),
};
