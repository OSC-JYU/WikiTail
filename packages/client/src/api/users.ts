import type { User, UserRole } from '@wikitail/shared';
import { api } from './client';

export const usersApi = {
  me: () => api.get<User>('/me'),
  list: () => api.get<User[]>('/users'),
  setRole: (id: number, role: UserRole) => api.patch<User>(`/users/${id}/role`, { role }),
};
