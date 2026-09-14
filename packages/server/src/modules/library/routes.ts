import Boom from '@hapi/boom';
import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import type { SourceType, User } from '@wikitail/shared';
import type { Readable } from 'node:stream';
import { config } from '../../config.js';
import {
  getLibraryItem,
  importToLibrary,
  listLibrary,
  searchSource,
  updateLibraryItem,
  uploadToLibrary,
} from './service.js';

/** A file part parsed by hapi in stream mode. */
interface UploadPart extends Readable {
  hapi: { filename: string; headers: Record<string, string> };
}

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
            language: Joi.string().min(2).max(12).optional(),
          }),
        },
      },
      handler: (request) => {
        const { q, limit, language } = request.query as {
          q: string;
          limit: number;
          language?: string;
        };
        return searchSource(request.params.sourceType as SourceType, q, limit, language);
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
      path: '/api/library/upload',
      options: {
        payload: {
          // Streamed rather than buffered: an upload can be a large video, and
          // hapi rejects anything over the ceiling before it reaches the handler.
          output: 'stream',
          parse: true,
          multipart: { output: 'stream' },
          maxBytes: config.maxUploadBytes,
          allow: 'multipart/form-data',
          timeout: false,
        },
      },
      handler: (request) => {
        const payload = request.payload as {
          file?: UploadPart;
          title?: string;
          description?: string;
          author?: string;
          licenceId?: string;
        };
        if (!payload.file?.hapi?.filename) {
          throw Boom.badRequest('No file was uploaded');
        }

        return uploadToLibrary(request.auth.credentials as unknown as User, {
          stream: payload.file,
          mimeType: payload.file.hapi.headers['content-type']?.split(';')[0] ?? '',
          filename: payload.file.hapi.filename,
          title: payload.title,
          description: payload.description,
          author: payload.author,
          licenceId: payload.licenceId,
        });
      },
    });

    server.route({
      method: 'PATCH',
      path: '/api/library/{id}',
      options: {
        validate: {
          payload: Joi.object({
            description: Joi.string().allow('', null).max(2000).optional(),
            title: Joi.string().min(1).max(300).optional(),
            author: Joi.string().allow('').max(300).optional(),
            licenceId: Joi.string().max(60).optional(),
          }),
        },
      },
      handler: (request) => {
        const input = request.payload as {
          description?: string | null;
          title?: string;
          author?: string;
          licenceId?: string;
        };
        return updateLibraryItem(
          request.auth.credentials as unknown as User,
          Number(request.params.id),
          input,
        );
      },
    });

    server.route({
      method: 'POST',
      path: '/api/library/import',
      options: {
        validate: {
          payload: Joi.object({
            sourceType: Joi.string().valid(...SOURCE_TYPES).required(),
            externalId: Joi.string().min(1).max(500).required(),
            // Supplies the project context that decides which sibling languages to fetch.
            articleId: Joi.number().integer().optional(),
          }),
        },
      },
      handler: (request) => {
        const { sourceType, externalId, articleId } = request.payload as {
          sourceType: SourceType;
          externalId: string;
          articleId?: number;
        };
        return importToLibrary(
          request.auth.credentials as unknown as User,
          sourceType,
          externalId,
          articleId,
        );
      },
    });
  },
};
