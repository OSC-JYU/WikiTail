import { defineStore } from 'pinia';
import type { User } from '@wikitail/shared';
import { usersApi } from '../api/users';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    loaded: false,
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    async load() {
      this.user = await usersApi.me();
      this.loaded = true;
    },
  },
});
