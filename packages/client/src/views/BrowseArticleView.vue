<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Article } from '@wikitail/shared';
import { articlesApi } from '../api/articles';

// Stub preview using the authenticated article endpoint. Public, unauthenticated
// browsing (mobile-first feed with Tail) lands in M3 via a dedicated /api/public
// route and a proper ArticleFeed/TailItemCard layout.
const props = defineProps<{ slug: string; id: string }>();

const article = ref<Article | null>(null);

onMounted(async () => {
  article.value = await articlesApi.get(Number(props.id));
});
</script>

<template>
  <div v-if="article">
    <RouterLink :to="{ name: 'project', params: { slug } }">&larr; back to project</RouterLink>
    <h1>{{ article.title }}</h1>
    <pre class="body">{{ article.bodyMarkdown }}</pre>
  </div>
</template>

<style scoped>
.body {
  white-space: pre-wrap;
  font-family: inherit;
}
</style>
