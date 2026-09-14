import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import type { User } from '@wikitail/shared';
import { createProject, getProjectBySlug, listProjects } from './service.js';

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
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { title, description } = request.payload as { title: string; description?: string };
        return createProject(actor, { title, description: description ?? null });
      },
    });
  },
};
