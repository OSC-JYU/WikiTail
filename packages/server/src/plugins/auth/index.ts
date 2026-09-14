import type { Plugin, Server } from '@hapi/hapi';
import { config } from '../../config.js';
import { devScheme } from './dev-scheme.js';
import { headerScheme } from './header-scheme.js';

export const authPlugin: Plugin<undefined> = {
  name: 'wikitail-auth',
  register(server: Server) {
    server.auth.scheme('dev', devScheme);
    server.auth.scheme('header', headerScheme);
    server.auth.strategy('identity', config.authMode);
    server.auth.default('identity');
  },
};
