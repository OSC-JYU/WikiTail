import type { MyProject, User, UserRole } from '@wikitail/shared';
import { api } from './client';

export const usersApi = {
  me: () => api.get<User>('/me'),
  updateMe: (displayName: string) => api.patch<User>('/me', { displayName }),
  myProjects: () => api.get<MyProject[]>('/me/projects'),
  list: () => api.get<User[]>('/users'),
  setRole: (id: number, role: UserRole) => api.patch<User>(`/users/${id}/role`, { role }),
  add: (email: string, role: UserRole) => api.post<User>('/users', { email, role }),
};
