import type { Plugin, Server } from '@hapi/hapi';
import type { User } from '@wikitail/shared';

export const usersRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-users-routes',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: '/api/me',
      handler: (request) => request.auth.credentials as unknown as User,
    });
  },
};
