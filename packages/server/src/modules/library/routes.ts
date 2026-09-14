import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import type { SourceType, User } from '@wikitail/shared';
import { getLibraryItem, importToLibrary, listLibrary, searchSource } from './service.js';

const SOURCE_TYPES = ['wikipedia', 'wikidata', 'commons', 'finna', 'local_upload'];

export const libraryRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-library-routes',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: '/api/sources/{sourceType}/search',
      options: {
        validate: {
          params: Joi.object({ sourceType: Joi.string().valid(...SOURCE_TYPES).required() }),
          query: Joi.object({
            q: Joi.string().min(1).max(300).required(),
            limit: Joi.number().integer().min(1).max(25).default(10),
          }),
        },
      },
      handler: (request) => {
        const { q, limit } = request.query as { q: string; limit: number };
        return searchSource(request.params.sourceType as SourceType, q, limit);
      },
    });

    server.route({
      method: 'GET',
      path: '/api/library',
      handler: (request) => listLibrary(request.auth.credentials as unknown as User),
    });

    server.route({
      method: 'GET',
      path: '/api/library/{id}',
      handler: (request) =>
        getLibraryItem(request.auth.credentials as unknown as User, Number(request.params.id)),
    });

    server.route({
      method: 'POST',
      path: '/api/library/import',
      options: {
        validate: {
          payload: Joi.object({
            sourceType: Joi.string().valid(...SOURCE_TYPES).required(),
            externalId: Joi.string().min(1).max(500).required(),
          }),
        },
      },
      handler: (request) => {
        const { sourceType, externalId } = request.payload as {
          sourceType: SourceType;
          externalId: string;
        };
        return importToLibrary(request.auth.credentials as unknown as User, sourceType, externalId);
      },
    });
  },
};
