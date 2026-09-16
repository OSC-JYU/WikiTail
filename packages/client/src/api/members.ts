import type {
  BatchAddMembersResult,
  ProjectMember,
  ProjectMemberRole,
} from '@wikitail/shared';
import { api } from './client';

export const membersApi = {
  list: (slug: string) => api.get<ProjectMember[]>(`/projects/${slug}/members`),

  addBatch: (slug: string, emails: string[], role: ProjectMemberRole) =>
    api.post<BatchAddMembersResult>(`/projects/${slug}/members`, { emails, role }),

  updateRole: (slug: string, userId: number, role: ProjectMemberRole) =>
    api.patch<ProjectMember>(`/projects/${slug}/members/${userId}`, { role }),

  remove: (slug: string, userId: number) =>
    api.delete<void>(`/projects/${slug}/members/${userId}`),
};
