import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import type { User } from '@wikitail/shared';
import { getProjectBySlug } from '../projects/service.js';
import {
  createArticle,
  createTranslation,
  getArticle,
  listArticlesForProject,
  listVersions,
  resolveInLanguage,
  setTranslationFallback,
  updateArticle,
} from './service.js';

export const articlesRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-articles-routes',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: '/api/projects/{slug}/articles',
      options: {
        validate: {
          query: Joi.object({ language: Joi.string().min(2).max(12).optional() }),
        },
      },
      handler: (request) => {
        const project = getProjectBySlug(request.params.slug as string);
        const { language } = request.query as { language?: string };
        return listArticlesForProject(project.id, language);
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
            language: Joi.string().min(2).max(12).optional(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const project = getProjectBySlug(request.params.slug as string);
        const { title, bodyMarkdown, language } = request.payload as {
          title: string;
          bodyMarkdown?: string;
          language?: string;
        };
        return createArticle(actor, project.id, {
          title,
          bodyMarkdown: bodyMarkdown ?? '',
          language,
        });
      },
    });

    server.route({
      method: 'GET',
      path: '/api/articles/{id}',
      handler: (request) => getArticle(Number(request.params.id)),
    });

    server.route({
      method: 'GET',
      path: '/api/articles/{id}/versions',
      handler: (request) => listVersions(getArticle(Number(request.params.id)).translationGroupId),
    });

    server.route({
      method: 'POST',
      path: '/api/articles/{id}/translations',
      options: {
        validate: {
          payload: Joi.object({
            language: Joi.string().min(2).max(12).required(),
            title: Joi.string().min(1).max(200).required(),
            bodyMarkdown: Joi.string().allow('').optional(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { language, title, bodyMarkdown } = request.payload as {
          language: string;
          title: string;
          bodyMarkdown?: string;
        };
        return createTranslation(actor, Number(request.params.id), {
          language,
          title,
          bodyMarkdown: bodyMarkdown ?? '',
        });
      },
    });

    server.route({
      method: 'GET',
      path: '/api/translation-groups/{id}',
      options: {
        validate: { query: Joi.object({ language: Joi.string().min(2).max(12).required() }) },
      },
      handler: (request) => {
        const { language } = request.query as { language: string };
        return resolveInLanguage(Number(request.params.id), language);
      },
    });

    server.route({
      method: 'PATCH',
      path: '/api/translation-groups/{id}/fallback',
      options: {
        validate: {
          payload: Joi.object({
            fallbackArticleId: Joi.number().integer().allow(null).required(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { fallbackArticleId } = request.payload as { fallbackArticleId: number | null };
        return setTranslationFallback(actor, Number(request.params.id), fallbackArticleId);
      },
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
        const { title, bodyMarkdown, status } = request.payload as {
          title: string;
          bodyMarkdown: string;
          status: 'draft' | 'published';
        };
        return updateArticle(actor, Number(request.params.id), { title, bodyMarkdown, status });
      },
    });
  },
};
