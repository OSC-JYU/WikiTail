import Hapi from '@hapi/hapi';
import './db/connection.js'; // runs migrations as a side effect, before any repository imports
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { authPlugin } from './plugins/auth/index.js';
import { staticPlugin } from './plugins/static.js';
import { usersRoutesPlugin } from './modules/users/routes.js';
import { projectsRoutesPlugin } from './modules/projects/routes.js';
import { articlesRoutesPlugin } from './modules/articles/routes.js';

async function main() {
  const server = Hapi.server({
    port: config.port,
    host: '0.0.0.0',
  });

  await server.register(authPlugin);
  await server.register(usersRoutesPlugin);
  await server.register(projectsRoutesPlugin);
  await server.register(articlesRoutesPlugin);
  await server.register(staticPlugin);

  await server.start();
  logger.info(`Wikitail server running at ${server.info.uri} (auth mode: ${config.authMode})`);
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
