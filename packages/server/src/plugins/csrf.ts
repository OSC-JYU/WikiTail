import Boom from '@hapi/boom';
import type { Plugin, Server } from '@hapi/hapi';

/**
 * A minimal CSRF gate for state-changing requests.
 *
 * With the whole app behind an SSO reverse proxy every browser request carries
 * a session cookie the proxy uses to set the `mail` header. That is exactly the
 * condition classic CSRF exploits — a hostile page can make a visitor's browser
 * fire a request the app cannot tell apart from a legitimate one.
 *
 * JSON requests are safe already: hapi does not add CORS headers, so a
 * cross-origin `fetch` with `Content-Type: application/json` triggers a
 * preflight that fails. But `multipart/form-data` is a CORS simple request
 * and does not preflight; the file-upload endpoint would otherwise be
 * reachable from a hostile origin.
 *
 * `Sec-Fetch-Site` is set automatically by every modern browser and cannot be
 * forged from JavaScript. `same-origin` and `none` (top-level navigation) are
 * allowed. Anything else — `same-site` (another subdomain) or `cross-site` —
 * is rejected. Non-browser callers (curl, native apps) omit the header
 * entirely; they are allowed through and rely on the upstream auth layer, so
 * server-to-server callers keep working.
 */
export const csrfPlugin: Plugin<undefined> = {
  name: 'wikitail-csrf',
  register(server: Server) {
    const stateChanging = new Set(['post', 'patch', 'put', 'delete']);
    server.ext('onPreAuth', (request, h) => {
      if (!stateChanging.has(request.method)) return h.continue;
      const site = request.headers['sec-fetch-site'];
      if (site && site !== 'same-origin' && site !== 'none') {
        throw Boom.forbidden('Cross-origin request blocked');
      }
      return h.continue;
    });
  },
};
