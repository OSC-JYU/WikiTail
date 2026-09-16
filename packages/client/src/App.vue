<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from './stores/auth';
import logo from './assets/wikitail-logo.png';
import LanguageSwitcher from './components/common/LanguageSwitcher.vue';

const auth = useAuthStore();
const route = useRoute();
const { locale } = useI18n();

/**
 * Reading stays a single narrow column — browsing is mobile-first. Editing is a
 * desktop job with a source pane and a preview side by side, so it gets the width.
 */
const wideLayout = computed(() => route.name === 'article-edit');

onMounted(() => {
  document.documentElement.lang = locale.value;
  // The store handles its own errors — a public visitor (no session at all)
  // and an SSO'd but not-on-the-guest-list visitor are told apart there.
  auth.load().then(() => auth.startSessionPoll());
});

function reloadForSignIn() {
  window.location.reload();
}
</script>

<template>
  <header class="app-header">
    <RouterLink to="/" class="brand"><img :src="logo" alt="Wikitail" class="brand-logo" /></RouterLink>
    <div class="right">
      <LanguageSwitcher />
      <RouterLink v-if="auth.user" :to="{ name: 'admin-home' }" class="admin-link">
        {{ $t('nav.edit') }}
      </RouterLink>
      <span v-if="auth.user" class="user">{{ auth.user.email }}</span>
    </div>
  </header>
  <!-- SSO recognised them but Wikitail does not. Public routes still work
       (they are auth: false on the server), so this is a banner rather than a
       full lock-out — the visitor can still read. -->
  <div v-if="auth.denied" class="access-denied" role="alert">
    <strong>{{ $t('auth.deniedTitle') }}</strong>
    <span>{{ $t('auth.deniedBody') }}</span>
  </div>
  <!-- The SSO session timed out during an idle period we cannot detect any
       other way than a poll finding /api/me suddenly unauthenticated. There
       is nothing to retry — only a fresh sign-in fixes it — so this blocks
       the page rather than sitting as a banner that is easy to miss. -->
  <div v-if="auth.expired" class="session-expired" role="alertdialog">
    <div class="session-expired-box">
      <strong>{{ $t('auth.expiredTitle') }}</strong>
      <p>{{ $t('auth.expiredBody') }}</p>
      <button type="button" @click="reloadForSignIn">{{ $t('auth.expiredReload') }}</button>
    </div>
  </div>
  <main :class="{ wide: wideLayout }">
    <RouterView />
  </main>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}
.brand {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: inherit;
}
.brand-logo {
  height: 28px;
  width: auto;
  display: block;
  background: #fff;
  border-radius: 4px;
  padding: 2px 6px;
}
.right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.admin-link {
  font-size: 0.85rem;
}
.user {
  font-size: 0.85rem;
  color: var(--text-muted);
}
@media (max-width: 480px) {
  .user {
    display: none;
  }
}
main {
  max-width: 46rem;
  margin: 0 auto;
  padding: 1rem;
}
main.wide {
  max-width: 88rem;
}
.access-denied {
  max-width: 46rem;
  margin: 1rem auto 0;
  padding: 0.75rem 1rem;
  border: 1px solid #d97706;
  background: #fef3c7;
  color: #78350f;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}
.access-denied strong {
  font-size: 1rem;
}
.session-expired {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
}
.session-expired-box {
  max-width: 24rem;
  padding: 1.25rem 1.5rem;
  background: var(--bg, #fff);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.session-expired-box strong {
  font-size: 1.05rem;
}
.session-expired-box button {
  align-self: flex-start;
}
</style>
