<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Article } from '@wikitail/shared';
import { articlesApi } from '../api/articles';

const props = defineProps<{ slug: string; id: string }>();

const article = ref<Article | null>(null);
const saving = ref(false);

async function load() {
  article.value = await articlesApi.get(Number(props.id));
}

onMounted(load);

async function save(status: 'draft' | 'published') {
  if (!article.value) return;
  saving.value = true;
  try {
    article.value = await articlesApi.update(article.value.id, {
      title: article.value.title,
      bodyMarkdown: article.value.bodyMarkdown,
      status,
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="article">
    <RouterLink :to="{ name: 'project', params: { slug } }">&larr; back to project</RouterLink>

    <input v-model="article.title" class="title-input" />

    <!-- Editor tabs (Wiki world / Commons / Finna / My Library / Local) land in later milestones -->
    <textarea v-model="article.bodyMarkdown" class="body-input" rows="16" placeholder="Write in markdown..." />

    <div class="actions">
      <button :disabled="saving" @click="save('draft')">Save draft</button>
      <button :disabled="saving" @click="save('published')">Publish</button>
      <span class="status">Status: {{ article.status }}</span>
    </div>
  </div>
</template>

<style scoped>
.title-input {
  display: block;
  width: 100%;
  font-size: 1.5rem;
  padding: 0.5rem;
  margin: 1rem 0;
}
.body-input {
  display: block;
  width: 100%;
  font-family: monospace;
  padding: 0.5rem;
}
.actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
}
.status {
  font-size: 0.85rem;
  color: #666;
}
</style>
