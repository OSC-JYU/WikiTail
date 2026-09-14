import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import type { User } from '@wikitail/shared';
import { getProjectBySlug } from '../projects/service.js';
import { createArticle, getArticle, listArticlesForProject, updateArticle } from './service.js';

export const articlesRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-articles-routes',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: '/api/projects/{slug}/articles',
      handler: (request) => {
        const project = getProjectBySlug(request.params.slug as string);
        return listArticlesForProject(project.id);
      },
    });

    server.route({
      method: 'POST',
      path: '/api/projects/{slug}/articles',
      options: {
        validate: {
          payload: Joi.object({
            title: Joi.string().min(1).max(200).required(),
            bodyMarkdown: Joi.string().allow('').optional(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const project = getProjectBySlug(request.params.slug as string);
        const { title, bodyMarkdown } = request.payload as { title: string; bodyMarkdown?: string };
        return createArticle(actor, project.id, { title, bodyMarkdown: bodyMarkdown ?? '' });
      },
    });

    server.route({
      method: 'GET',
      path: '/api/articles/{id}',
      handler: (request) => getArticle(Number(request.params.id)),
    });

    server.route({
      method: 'PATCH',
      path: '/api/articles/{id}',
      options: {
        validate: {
          payload: Joi.object({
            title: Joi.string().min(1).max(200).required(),
            bodyMarkdown: Joi.string().allow('').required(),
            status: Joi.string().valid('draft', 'published').required(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const id = Number(request.params.id);
        const { title, bodyMarkdown, status } = request.payload as {
          title: string;
          bodyMarkdown: string;
          status: 'draft' | 'published';
        };
        return updateArticle(actor, id, { title, bodyMarkdown, status });
      },
    });
  },
};
