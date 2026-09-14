<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Article } from '@wikitail/shared';
import { articlesApi } from '../api/articles';
import WikiWorldTab from '../components/editor/WikiWorldTab.vue';
import MyLibraryTab from '../components/editor/MyLibraryTab.vue';

const props = defineProps<{ slug: string; id: string }>();

// Commons, Finna and Local tabs arrive with their adapters in later milestones.
const tabs = ['Article', 'Wiki world', 'My Library'] as const;
const activeTab = ref<(typeof tabs)[number]>('Article');

const article = ref<Article | null>(null);
const saving = ref(false);

onMounted(async () => {
  article.value = await articlesApi.get(Number(props.id));
});

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

    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </nav>

    <section v-show="activeTab === 'Article'">
      <textarea
        v-model="article.bodyMarkdown"
        class="body-input"
        rows="16"
        placeholder="Write in markdown..."
      />
      <div class="actions">
        <button :disabled="saving" @click="save('draft')">Save draft</button>
        <button :disabled="saving" @click="save('published')">Publish</button>
        <span class="status">Status: {{ article.status }}</span>
      </div>
    </section>

    <section v-show="activeTab === 'Wiki world'">
      <WikiWorldTab />
    </section>

    <section v-show="activeTab === 'My Library'">
      <MyLibraryTab />
    </section>
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
.tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}
.tabs button {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  padding: 0.5rem 0.75rem;
}
.tabs button.active {
  color: var(--text);
  border-bottom-color: currentColor;
  font-weight: 500;
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
  color: var(--text-muted);
}
</style>
