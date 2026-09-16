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
  removeLibraryItem,
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
            // Callers page by asking for the next chunk starting after the
            // results they already have — `offset = results.length`. Adapters
            // translate to their source's paging shape (Wikipedia/Commons:
            // `gsroffset`; Finna: `page`). Capped generously to keep a wild
            // client from asking for the 10,000th page.
            offset: Joi.number().integer().min(0).max(1000).default(0),
            language: Joi.string().min(2).max(12).optional(),
            // Finna scopes results by media kind; other adapters ignore this.
            // Repeated `types=image&types=audio` or single `types=image` both
            // work — `.single()` coerces a lone value to an array.
            types: Joi.array()
              .items(Joi.string().valid('image', 'audio', 'video', 'text'))
              .single()
              .optional(),
            // Lets the search hint ("link only") reflect this project's
            // finnaAllowNonCommercial setting rather than a generic default.
            // Optional — the tab UI always has an article to search from, but
            // the route does not require it.
            articleId: Joi.number().integer().optional(),
          }),
        },
      },
      handler: (request) => {
        const { q, limit, offset, language, types, articleId } = request.query as {
          q: string;
          limit: number;
          offset: number;
          language?: string;
          types?: string[];
          articleId?: number;
        };
        return searchSource(
          request.params.sourceType as SourceType,
          q,
          limit,
          language,
          types,
          offset,
          articleId,
        );
      },
    });

    server.route({
      method: 'GET',
      path: '/api/articles/{articleId}/library',
      handler: (request) => listLibrary(Number(request.params.articleId)),
    });

    server.route({
      method: 'GET',
      path: '/api/library/{id}',
      handler: (request) => getLibraryItem(Number(request.params.id)),
    });

    server.route({
      method: 'POST',
      path: '/api/articles/{articleId}/library/upload',
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

        return uploadToLibrary(
          request.auth.credentials as unknown as User,
          Number(request.params.articleId),
          {
            stream: payload.file,
            mimeType: payload.file.hapi.headers['content-type']?.split(';')[0] ?? '',
            filename: payload.file.hapi.filename,
            title: payload.title,
            description: payload.description,
            author: payload.author,
            licenceId: payload.licenceId,
          },
        );
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
      method: 'DELETE',
      path: '/api/library/{id}',
      handler: (request, h) => {
        // Refuses with 409 when the item is still referenced by a tail entry
        // or an article body; the client shows the returned message so the
        // reader can go and clear those references first.
        removeLibraryItem(
          request.auth.credentials as unknown as User,
          Number(request.params.id),
        );
        return h.response().code(204);
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
            // The article whose library this goes into, and whose project decides
            // which sibling languages are fetched alongside.
            articleId: Joi.number().integer().required(),
          }),
        },
      },
      handler: (request) => {
        const { sourceType, externalId, articleId } = request.payload as {
          sourceType: SourceType;
          externalId: string;
          articleId: number;
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
