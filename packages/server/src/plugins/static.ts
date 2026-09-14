import fs from 'node:fs';
import path from 'node:path';
import Inert from '@hapi/inert';
import type { Plugin, Server } from '@hapi/hapi';
import { config } from '../config.js';

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

    // SPA fallback: serve the built asset if it exists on disk, otherwise
    // index.html so Vue Router can handle client-side routes.
    server.route({
      method: 'GET',
      path: '/{param*}',
      options: { auth: false },
      handler: (request, h) => {
        const requested = path.join(config.clientDistDir, (request.params.param as string) ?? '');
        const target = fs.existsSync(requested) && fs.statSync(requested).isFile()
          ? requested
          : path.join(config.clientDistDir, 'index.html');
        return h.file(target);
      },
    });
  },
};
