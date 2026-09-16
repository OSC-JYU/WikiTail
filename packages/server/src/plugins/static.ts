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
      options: {
        auth: false,
        // These files come from users and from Commons, and they are served from
        // the app's own origin. An SVG can carry script, so navigating straight
        // to one would otherwise run it here: sandbox the response and stop the
        // browser sniffing a different type than we declared.
        //
        // PDFs are exempted from the `sandbox` directive: the browser's built-in
        // viewer needs to run its own UI (pagination, zoom) inside the iframe,
        // and a plain `sandbox` blocks the scripts it uses. `nosniff` still
        // applies so the file cannot be reinterpreted as something else.
        ext: {
          onPostHandler: {
            method: (request, h) => {
              // Boom errors are Errors; a served file is a ResponseObject.
              const response = request.response;
              if (!(response instanceof Error)) {
                const isPdf = /\.pdf$/i.test(String(request.params.param ?? ''));
                if (!isPdf) {
                  response.header('Content-Security-Policy', "sandbox; default-src 'none'");
                }
                response.header('X-Content-Type-Options', 'nosniff');
              }
              return h.continue;
            },
          },
        },
      },
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
