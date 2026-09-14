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
  // Public visitors have no session; a failure here is expected, not an error.
  auth.load().catch(() => undefined);
});
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
</style>
