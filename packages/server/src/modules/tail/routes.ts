import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import type { User } from '@wikitail/shared';
import {
  addToTail,
  listTail,
  removeTailEntry,
  reorderTail,
  updateTailEntry,
} from './service.js';

export const tailRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-tail-routes',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: '/api/articles/{id}/tail',
      handler: (request) => listTail(Number(request.params.id)),
    });

    server.route({
      method: 'POST',
      path: '/api/articles/{id}/tail',
      options: {
        validate: {
          payload: Joi.object({
            libraryItemId: Joi.number().integer().required(),
            commentary: Joi.string().allow('', null).max(5000).optional(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { libraryItemId, commentary } = request.payload as {
          libraryItemId: number;
          commentary?: string | null;
        };
        return addToTail(actor, Number(request.params.id), {
          libraryItemId,
          commentary: commentary || null,
        });
      },
    });

    server.route({
      method: 'PUT',
      path: '/api/articles/{id}/tail/order',
      options: {
        validate: {
          payload: Joi.object({
            entryIds: Joi.array().items(Joi.number().integer()).required(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { entryIds } = request.payload as { entryIds: number[] };
        return reorderTail(actor, Number(request.params.id), entryIds);
      },
    });

    server.route({
      method: 'PATCH',
      path: '/api/tail-entries/{id}',
      options: {
        validate: {
          payload: Joi.object({
            commentary: Joi.string().allow('', null).max(5000).required(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { commentary } = request.payload as { commentary: string | null };
        return updateTailEntry(actor, Number(request.params.id), commentary || null);
      },
    });

    server.route({
      method: 'DELETE',
      path: '/api/tail-entries/{id}',
      handler: (request, h) => {
        const actor = request.auth.credentials as unknown as User;
        removeTailEntry(actor, Number(request.params.id));
        return h.response().code(204);
      },
    });
  },
};
