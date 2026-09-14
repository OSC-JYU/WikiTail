import type { User } from '@wikitail/shared';
import { api } from './client';

export const usersApi = {
  me: () => api.get<User>('/me'),
};
