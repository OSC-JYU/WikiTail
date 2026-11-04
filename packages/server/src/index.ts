import fs from 'node:fs';
import path from 'node:path';
import Hapi from '@hapi/hapi';
import './db/connection.js'; // runs migrations as a side effect, before any repository imports
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { authPlugin } from './plugins/auth/index.js';
import { csrfPlugin } from './plugins/csrf.js';
import { staticPlugin } from './plugins/static.js';
import { usersRoutesPlugin } from './modules/users/routes.js';
import { projectsRoutesPlugin } from './modules/projects/routes.js';
import { projectMembersRoutesPlugin } from './modules/projects/members-routes.js';
import { articlesRoutesPlugin } from './modules/articles/routes.js';
import { libraryRoutesPlugin } from './modules/library/routes.js';
import { tailRoutesPlugin } from './modules/tail/routes.js';
import { publicRoutesPlugin } from './modules/public/routes.js';
import { exportRoutesPlugin } from './modules/export/routes.js';

async function main() {
  const server = Hapi.server({
    port: config.port,
    host: '0.0.0.0',
  });

  // CSRF runs onPreAuth, before any auth strategy, so it protects every
  // state-changing route including public and unauthenticated ones.
  await server.register(csrfPlugin);
  await server.register(authPlugin);
  await server.register(usersRoutesPlugin);
  await server.register(projectsRoutesPlugin);
  await server.register(projectMembersRoutesPlugin);
  await server.register(articlesRoutesPlugin);
  await server.register(libraryRoutesPlugin);
  await server.register(tailRoutesPlugin);
  await server.register(publicRoutesPlugin);
  await server.register(exportRoutesPlugin);
  await server.register(staticPlugin);

  await server.start();
  logger.info(`Wikitail API listening on ${server.info.uri} (auth mode: ${config.authMode})`);
  if (!fs.existsSync(path.join(config.clientDistDir, 'index.html'))) {
    logger.info('Client not built — open the Vite dev server at http://localhost:5173');
  }
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
