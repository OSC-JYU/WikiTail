import type { Plugin, Server } from '@hapi/hapi';
import Joi from 'joi';
import type { ProjectMemberRole, User } from '@wikitail/shared';
import {
  batchAddMembers,
  listMembers,
  removeMember,
  updateMemberRole,
} from './members-service.js';

const memberRole = Joi.string().valid('editor', 'manager');

export const projectMembersRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-project-members-routes',
  register(server: Server) {
    server.route({
      method: 'GET',
      path: '/api/projects/{slug}/members',
      handler: (request) =>
        listMembers(request.auth.credentials as unknown as User, request.params.slug as string),
    });

    server.route({
      method: 'POST',
      path: '/api/projects/{slug}/members',
      options: {
        validate: {
          payload: Joi.object({
            emails: Joi.array().items(Joi.string().max(320)).min(1).max(500).required(),
            role: memberRole.default('editor'),
          }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { emails, role } = request.payload as { emails: string[]; role: ProjectMemberRole };
        return batchAddMembers(actor, request.params.slug as string, emails, role);
      },
    });

    server.route({
      method: 'PATCH',
      path: '/api/projects/{slug}/members/{userId}',
      options: {
        validate: {
          payload: Joi.object({ role: memberRole.required() }),
        },
      },
      handler: (request) => {
        const actor = request.auth.credentials as unknown as User;
        const { role } = request.payload as { role: ProjectMemberRole };
        return updateMemberRole(
          actor,
          request.params.slug as string,
          Number(request.params.userId),
          role,
        );
      },
    });

    server.route({
      method: 'DELETE',
      path: '/api/projects/{slug}/members/{userId}',
      handler: (request, h) => {
        removeMember(
          request.auth.credentials as unknown as User,
          request.params.slug as string,
          Number(request.params.userId),
        );
        return h.response().code(204);
      },
    });
  },
};
