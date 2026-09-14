import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import type { User, UserRole } from '@wikitail/shared';
import { listUsers, setUserRole } from './service.js';

export const usersRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-users-routes',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: '/api/me',
      handler: (request) => request.auth.credentials as unknown as User,
    });

    server.route({
      method: 'GET',
      path: '/api/users',
      handler: (request) => listUsers(request.auth.credentials as unknown as User),
    });

    server.route({
      method: 'PATCH',
      path: '/api/users/{id}/role',
      options: {
        validate: {
          payload: Joi.object({ role: Joi.string().valid('admin', 'author').required() }),
        },
      },
      handler: (request) => {
        const { role } = request.payload as { role: UserRole };
        return setUserRole(
          request.auth.credentials as unknown as User,
          Number(request.params.id),
          role,
        );
      },
    });
  },
};
