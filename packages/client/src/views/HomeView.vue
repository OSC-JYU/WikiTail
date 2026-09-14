<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { User, UserRole } from '@wikitail/shared';
import { usersApi } from '../api/users';
import { useAuthStore } from '../stores/auth';
import { useProjectsStore } from '../stores/projects';

const auth = useAuthStore();
const projects = useProjectsStore();

const newTitle = ref('');
const creating = ref(false);
const error = ref<string | null>(null);

const users = ref<User[]>([]);
const roleError = ref<string | null>(null);
const newUserEmail = ref('');
const newUserRole = ref<UserRole>('author');
const addingUser = ref(false);

onMounted(async () => {
  await projects.fetchAll();
  // Only admins may list users; for anyone else this simply stays empty.
  if (auth.isAdmin) users.value = await usersApi.list();
});

async function addUser() {
  if (!newUserEmail.value.trim()) return;
  addingUser.value = true;
  roleError.value = null;
  try {
    users.value = [...users.value, await usersApi.add(newUserEmail.value, newUserRole.value)].sort(
      (a, b) => a.email.localeCompare(b.email),
    );
    newUserEmail.value = '';
    newUserRole.value = 'author';
  } catch (e) {
    roleError.value = e instanceof Error ? e.message : 'Could not add that person';
  } finally {
    addingUser.value = false;
  }
}

async function setRole(user: User, role: UserRole) {
  roleError.value = null;
  try {
    const updated = await usersApi.setRole(user.id, role);
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
  } catch (e) {
    roleError.value = e instanceof Error ? e.message : 'Could not change role';
  }
}

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

  <section v-if="auth.isAdmin && users.length" class="people">
    <h2>People</h2>
    <p class="hint">
      Sign-in is handled elsewhere; roles are set here. Admins can create projects and manage
      languages — authors write articles. Adding someone here sets their role in advance, so it is
      already right the first time they sign in.
    </p>
    <p v-if="roleError" class="error">{{ roleError }}</p>

    <form class="add-user" @submit.prevent="addUser">
      <input v-model="newUserEmail" type="email" placeholder="name@example.org" />
      <select v-model="newUserRole">
        <option value="author">author</option>
        <option value="admin">admin</option>
      </select>
      <button type="submit" :disabled="addingUser">Add person</button>
    </form>

    <ul>
      <li v-for="user in users" :key="user.id">
        <span class="email">{{ user.email }}</span>
        <select :value="user.role" @change="setRole(user, ($event.target as HTMLSelectElement).value as UserRole)">
          <option value="author">author</option>
          <option value="admin">admin</option>
        </select>
      </li>
    </ul>
  </section>
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
.people {
  margin-top: 2.5rem;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}
.add-user {
  display: flex;
  gap: 0.5rem;
  margin: 0.75rem 0;
  flex-wrap: wrap;
}
.add-user input {
  flex: 1;
  min-width: 14rem;
  padding: 0.45rem;
}
.people ul {
  list-style: none;
  padding: 0;
}
.people li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border);
}
.email {
  overflow-wrap: anywhere;
}
.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
}
</style>
