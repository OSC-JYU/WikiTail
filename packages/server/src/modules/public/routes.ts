import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import { getArticle, getLibraryItem, getProject, listProjectContent, listProjects } from './service.js';

/** Everything here is readable without a session — this is the public site. */
export const publicRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-public-routes',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: '/api/public/projects',
      options: { auth: false },
      handler: () => listProjects(),
    });

    server.route({
      method: 'GET',
      path: '/api/public/projects/{slug}',
      options: { auth: false },
      handler: (request) => getProject(request.params.slug as string),
    });

    server.route({
      method: 'GET',
      path: '/api/public/projects/{slug}/content',
      options: {
        auth: false,
        validate: { query: Joi.object({ language: Joi.string().min(2).max(12).required() }) },
      },
      handler: (request) => {
        const { language } = request.query as { language: string };
        return listProjectContent(request.params.slug as string, language);
      },
    });

    server.route({
      method: 'GET',
      path: '/api/public/projects/{projectSlug}/{language}/{articleSlug}',
      options: { auth: false },
      handler: (request) =>
        getArticle(
          request.params.projectSlug as string,
          request.params.language as string,
          request.params.articleSlug as string,
        ),
    });

    server.route({
      method: 'GET',
      path: '/api/public/library/{id}',
      options: { auth: false },
      handler: (request) => getLibraryItem(Number(request.params.id)),
    });
  },
};
