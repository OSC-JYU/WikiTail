/**
 * Wikitail's own origin, honouring a non-root deployment (e.g. reverse-proxied
 * at `https://example.org/s/wikitail/`). Vite bakes this in at build time from
 * the `base` config option (see vite.config.ts, driven by the `VITE_BASE_PATH`
 * env var) and exposes it as `import.meta.env.BASE_URL` — always `/` or a path
 * with both a leading and trailing slash.
 */
export const BASE_URL = import.meta.env.BASE_URL;

/**
 * Prefixes a root-relative path (`/uploads/...`) with the app's base path, so
 * it still resolves once a reverse proxy strips a prefix like `/s/wikitail`
 * before forwarding to this app. A path that is already absolute (`https://…`)
 * or already carries the base is returned unchanged — this is safe to call
 * on any URL a library item might carry, including ones the server has no
 * concept of a base path for (Commons, Finna, another site entirely).
 */
export function withBase(path: string): string;
export function withBase(path: string | null | undefined): string | null;
export function withBase(path: string | null | undefined): string | null {
  if (!path) return path ?? null;
  if (!path.startsWith('/') || path.startsWith(BASE_URL)) return path;
  return BASE_URL + path.slice(1);
}
