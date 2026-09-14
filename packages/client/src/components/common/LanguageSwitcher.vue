<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { setLocale } from '../../i18n';

/**
 * Offers the languages the current project uses when there is one, otherwise the
 * locales the interface itself is translated into.
 */
const props = defineProps<{ languages?: string[] }>();
const emit = defineEmits<{ change: [language: string] }>();

const { locale } = useI18n();
const options = () => props.languages ?? ['en', 'fi'];

function choose(language: string) {
  setLocale(language);
  emit('change', language);
}
</script>

<template>
  <div class="switcher">
    <button
      v-for="language in options()"
      :key="language"
      :class="{ active: locale === language }"
      @click="choose(language)"
    >
      {{ language }}
    </button>
  </div>
</template>

<style scoped>
.switcher {
  display: flex;
  gap: 0.25rem;
}
button {
  text-transform: uppercase;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: none;
  color: var(--text-muted);
}
button.active {
  color: var(--text);
  border-color: currentColor;
  font-weight: 600;
}
</style>
