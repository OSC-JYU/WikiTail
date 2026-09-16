import { defineStore } from 'pinia';
import type { User } from '@wikitail/shared';
import { ApiError } from '../api/client';
import { usersApi } from '../api/users';

// A single shared load promise: the router guard and App.vue's onMounted both
// call `load()` on first paint, and we do not want two /api/me round-trips.
// It lives outside pinia state because a Promise is not serialisable.
let pendingLoad: Promise<void> | null = null;

// The SSO reverse proxy owns the actual session lifetime — we have no event
// for "your session just expired", only the next request failing. Polling
// /api/me is how we notice without waiting for the user to click something
// that happens to hit the API.
let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    loaded: false,
    // Signed in upstream (SSO recognised them), but not on the guest list
    // — /api/me answered 403. Public browsing keeps working, but any admin
    // action will fail, so the UI shows a clear "not authorised" card.
    denied: false,
    // Was signed in, then a poll found the session gone (401) — the proxy
    // stopped forwarding identity, most likely because the SSO session timed
    // out during a long idle period. Nothing to retry: only a fresh sign-in
    // (page reload, redriving the SSO flow) fixes this.
    expired: false,
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    async load(): Promise<void> {
      if (this.loaded) return;
      if (pendingLoad) return pendingLoad;
      pendingLoad = (async () => {
        try {
          this.user = await usersApi.me();
          this.denied = false;
        } catch (err) {
          this.user = null;
          this.denied = err instanceof ApiError && err.status === 403;
        } finally {
          this.loaded = true;
          pendingLoad = null;
        }
      })();
      return pendingLoad;
    },

    /** Starts polling /api/me while signed in. Safe to call more than once. */
    startSessionPoll(): void {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        if (!this.user || this.expired) return;
        usersApi.me().catch((err) => {
          if (err instanceof ApiError && err.status === 401) {
            this.user = null;
            this.expired = true;
          }
          // Other failures (network blip, 5xx) are not evidence the session
          // is gone — leave the user signed in and try again next tick.
        });
      }, POLL_INTERVAL_MS);
    },

    stopSessionPoll(): void {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },
  },
});
