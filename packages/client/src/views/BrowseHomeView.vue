<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Project } from '@wikitail/shared';
import { publicApi } from '../api/public';

const projects = ref<Project[]>([]);
const loaded = ref(false);

onMounted(async () => {
  projects.value = await publicApi.projects();
  loaded.value = true;
});
</script>

<template>
  <h1>{{ $t('projects.title') }}</h1>

  <ul class="projects">
    <li v-for="project in projects" :key="project.id">
      <RouterLink :to="{ name: 'browse-project', params: { project: project.slug } }">
        <strong>{{ project.title }}</strong>
        <span v-if="project.description" class="desc">{{ project.description }}</span>
        <span class="langs">
          <span v-for="language in project.languages" :key="language" class="lang">
            {{ language }}
          </span>
        </span>
      </RouterLink>
    </li>
  </ul>

  <p v-if="loaded && projects.length === 0">{{ $t('projects.empty') }}</p>
</template>

<style scoped>
.projects {
  list-style: none;
  padding: 0;
}
.projects li {
  border-bottom: 1px solid var(--border);
}
.projects a {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.9rem 0;
  text-decoration: none;
  color: inherit;
}
.desc {
  font-size: 0.9rem;
  color: var(--text-muted);
}
.langs {
  display: flex;
  gap: 0.3rem;
}
.lang {
  font-size: 0.7rem;
  text-transform: uppercase;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 0.3rem;
  color: var(--text-muted);
}
</style>
