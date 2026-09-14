<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useProjectsStore } from '../stores/projects';

const auth = useAuthStore();
const projects = useProjectsStore();

const newTitle = ref('');
const creating = ref(false);
const error = ref<string | null>(null);

onMounted(() => projects.fetchAll());

async function createProject() {
  if (!newTitle.value.trim()) return;
  creating.value = true;
  error.value = null;
  try {
    const project = await projects.create({ title: newTitle.value.trim() });
    newTitle.value = '';
    return project;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create project';
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <h1>Projects</h1>

  <ul class="project-list">
    <li v-for="project in projects.projects" :key="project.id">
      <RouterLink :to="{ name: 'project', params: { slug: project.slug } }">{{ project.title }}</RouterLink>
    </li>
  </ul>
  <p v-if="projects.loaded && projects.projects.length === 0">No projects yet.</p>

  <form v-if="auth.isAdmin" class="new-project" @submit.prevent="createProject">
    <h2>New project</h2>
    <input v-model="newTitle" placeholder="Project title" />
    <button type="submit" :disabled="creating">Create</button>
    <p v-if="error" class="error">{{ error }}</p>
  </form>
</template>

<style scoped>
.project-list {
  list-style: none;
  padding: 0;
}
.project-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}
.new-project {
  margin-top: 2rem;
}
.new-project input {
  display: block;
  width: 100%;
  padding: 0.5rem;
  margin: 0.5rem 0;
}
.error {
  color: #c0392b;
}
</style>
