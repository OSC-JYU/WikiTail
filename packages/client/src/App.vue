<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';
import logo from './assets/wikitail-logo.png';

const auth = useAuthStore();
onMounted(() => auth.load());
</script>

<template>
  <header class="app-header">
    <RouterLink to="/" class="brand"><img :src="logo" alt="Wikitail" class="brand-logo" /></RouterLink>
    <span v-if="auth.user" class="user">{{ auth.user.email }} ({{ auth.user.role }})</span>
  </header>
  <main>
    <RouterView />
  </main>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e2e2e2;
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
.user {
  font-size: 0.85rem;
  color: #666;
}
main {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}
</style>
