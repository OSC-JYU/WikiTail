import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import type { SnapshotMode, User } from '@wikitail/shared';
import { MAX_CUSTOM_CSS_LENGTH, PROJECT_STYLES } from '@wikitail/shared';
import {
  createProject,
  getProjectBySlug,
  listProjects,
  setFinnaAllowNonCommercial,
  setProjectCustomCss,
  setProjectLanguages,
  setProjectStyle,
  setSnapshotMode,
} from './service.js';

export const projectsRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-projects-routes',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: '/api/projects',
      handler: () => listProjects(),
    });

    server.route({
      method: 'GET',
      path: '/api/projects/{slug}',
      handler: (request) => getProjectBySlug(request.params.slug as string),
    });

    server.route({
      method: 'POST',
      path: '/api/projects',
      options: {
        validate: {
          payload: Joi.object({
            title: Joi.string().min(1).max(200).required(),
            description: Joi.string().allow('').max(2000).optional(),
            languages: Joi.array().items(Joi.string().min(2).max(12)).min(1).optional(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { title, description, languages } = request.payload as {
          title: string;
          description?: string;
          languages?: string[];
        };
        return createProject(actor, { title, description: description ?? null, languages });
      },
    });

    server.route({
      method: 'PUT',
      path: '/api/projects/{slug}/snapshot-mode',
      options: {
        validate: {
          payload: Joi.object({
            snapshotMode: Joi.string().valid('hard_copy', 'live_link').required(),
          }),
        },
      },
      handler: (request) => {
        const { snapshotMode } = request.payload as { snapshotMode: SnapshotMode };
        return setSnapshotMode(
          request.auth.credentials as unknown as User,
          request.params.slug as string,
          snapshotMode,
        );
      },
    });

    server.route({
      method: 'PUT',
      path: '/api/projects/{slug}/finna-allow-noncommercial',
      options: {
        validate: {
          payload: Joi.object({
            allow: Joi.boolean().required(),
          }),
        },
      },
      handler: (request) => {
        const { allow } = request.payload as { allow: boolean };
        return setFinnaAllowNonCommercial(
          request.auth.credentials as unknown as User,
          request.params.slug as string,
          allow,
        );
      },
    });

    server.route({
      method: 'PUT',
      path: '/api/projects/{slug}/languages',
      options: {
        validate: {
          payload: Joi.object({
            languages: Joi.array().items(Joi.string().min(2).max(12)).min(1).required(),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { languages } = request.payload as { languages: string[] };
        return setProjectLanguages(actor, request.params.slug as string, languages);
      },
    });

    server.route({
      method: 'PUT',
      path: '/api/projects/{slug}/style',
      options: {
        validate: {
          payload: Joi.object({
            styleId: Joi.string()
              .valid(...PROJECT_STYLES.map((s) => s.id))
              .required(),
          }),
        },
      },
      handler: (request) => {
        const { styleId } = request.payload as { styleId: string };
        return setProjectStyle(
          request.auth.credentials as unknown as User,
          request.params.slug as string,
          styleId,
        );
      },
    });

    server.route({
      method: 'PUT',
      path: '/api/projects/{slug}/custom-css',
      options: {
        validate: {
          payload: Joi.object({
            css: Joi.string().allow('').max(MAX_CUSTOM_CSS_LENGTH).allow(null).optional(),
          }),
        },
      },
      handler: (request) => {
        const { css } = request.payload as { css?: string | null };
        return setProjectCustomCss(
          request.auth.credentials as unknown as User,
          request.params.slug as string,
          css ?? null,
        );
      },
    });
  },
};
