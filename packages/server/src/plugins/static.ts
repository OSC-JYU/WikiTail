import fs from 'node:fs';
import path from 'node:path';
import Inert from '@hapi/inert';
import type { Plugin, Server } from '@hapi/hapi';
import { config } from '../config.js';

const clientIndexHtml = path.join(config.clientDistDir, 'index.html');

const NO_BUILD_MESSAGE = `<!doctype html>
<meta charset="utf-8">
<title>Wikitail — client not built</title>
<body style="font: 16px system-ui; max-width: 40rem; margin: 4rem auto; padding: 0 1rem">
<h1>Client not built</h1>
<p>This port serves the Wikitail JSON API. It also serves the built UI, but
<code>packages/client/dist</code> does not exist yet.</p>
<p>In development, open the Vite dev server instead:
<a href="http://localhost:5173">http://localhost:5173</a></p>
<p>To serve the built UI from this port, run <code>npm run build</code>.</p>
</body>`;

export const staticPlugin: Plugin<undefined> = {
  name: 'wikitail-static',
  async register(server: Server) {
    await server.register(Inert);

    server.route({
      method: 'GET',
      path: '/uploads/{param*}',
      options: { auth: false },
      handler: {
        directory: { path: config.uploadsDir, redirectToSlash: false },
      },
    });

    // SPA fallback: serve the built asset if it exists, otherwise index.html so
    // Vue Router can handle deep links. `confine` must name the build dir — it
    // otherwise defaults to the process CWD, which would reject every path here.
    server.route({
      method: 'GET',
      path: '/{param*}',
      options: { auth: false },
      handler: (request, h) => {
        if (!fs.existsSync(clientIndexHtml)) {
          return h.response(NO_BUILD_MESSAGE).type('text/html').code(503);
        }
        const requested = path.resolve(config.clientDistDir, (request.params.param as string) ?? '');
        const insideBuild =
          requested === config.clientDistDir ||
          requested.startsWith(config.clientDistDir + path.sep);
        const target =
          insideBuild && fs.existsSync(requested) && fs.statSync(requested).isFile()
            ? requested
            : clientIndexHtml;
        return h.file(target, { confine: config.clientDistDir });
      },
    });
  },
};
