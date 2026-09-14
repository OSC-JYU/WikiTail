<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Article, Project } from '@wikitail/shared';
import { projectsApi } from '../api/projects';

const props = defineProps<{ slug: string }>();
const router = useRouter();

const project = ref<Project | null>(null);
const articles = ref<Article[]>([]);
const newTitle = ref('');
const creating = ref(false);

async function load() {
  project.value = await projectsApi.get(props.slug);
  articles.value = await projectsApi.listArticles(props.slug);
}

onMounted(load);

async function createArticle() {
  if (!newTitle.value.trim()) return;
  creating.value = true;
  try {
    const article = await projectsApi.createArticle(props.slug, { title: newTitle.value.trim() });
    newTitle.value = '';
    await load();
    router.push({ name: 'article-edit', params: { slug: props.slug, id: article.id } });
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div v-if="project">
    <h1>{{ project.title }}</h1>
    <p v-if="project.description">{{ project.description }}</p>

    <h2>Articles</h2>
    <ul class="article-list">
      <li v-for="article in articles" :key="article.id">
        <RouterLink :to="{ name: 'article-edit', params: { slug: project.slug, id: article.id } }">
          {{ article.title }}
        </RouterLink>
        <span class="status">{{ article.status }}</span>
      </li>
    </ul>
    <p v-if="articles.length === 0">No articles yet.</p>

    <form class="new-article" @submit.prevent="createArticle">
      <input v-model="newTitle" placeholder="Article title" />
      <button type="submit" :disabled="creating">Create article</button>
    </form>
  </div>
</template>

<style scoped>
.article-list {
  list-style: none;
  padding: 0;
}
.article-list li {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}
.status {
  font-size: 0.75rem;
  color: #666;
  text-transform: uppercase;
}
.new-article input {
  display: block;
  width: 100%;
  padding: 0.5rem;
  margin: 1rem 0 0.5rem;
}
</style>
