<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MyProject } from '@wikitail/shared';
import { usersApi } from '../api/users';
import { useAuthStore } from '../stores/auth';
import logo from '../assets/wikitail-logo.png';

const auth = useAuthStore();
const { t } = useI18n();

const projects = ref<MyProject[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);

// Falls back to the email prefix, which is also what the PDF export shows.
const nameInput = ref('');
const savingName = ref(false);
const nameSaved = ref(false);
const nameError = ref<string | null>(null);

function defaultName(): string {
  return auth.user?.email.split('@')[0] ?? '';
}

async function saveName() {
  savingName.value = true;
  nameSaved.value = false;
  nameError.value = null;
  try {
    auth.user = await usersApi.updateMe(nameInput.value);
    nameInput.value = auth.user.displayName ?? defaultName();
    nameSaved.value = true;
  } catch (e) {
    nameError.value = e instanceof Error ? e.message : t('welcome.nameSaveError');
  } finally {
    savingName.value = false;
  }
}

onMounted(async () => {
  nameInput.value = auth.user?.displayName ?? defaultName();
  try {
    projects.value = await usersApi.myProjects();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('welcome.loadError');
  } finally {
    loaded.value = true;
  }
});
</script>

<template>
  <section class="welcome">
    <img :src="logo" alt="Wikitail" class="logo" />
    <h1>
      {{
        auth.user?.displayName
          ? $t('welcome.greetingNamed', { name: auth.user.displayName })
          : $t('welcome.greeting')
      }}
    </h1>

    <p class="intro">{{ $t('welcome.intro') }}</p>

    <p class="help-link">
      <RouterLink :to="{ name: 'help' }">{{ $t('welcome.helpLink') }}</RouterLink>
      &middot;
      <RouterLink :to="{ name: 'tutorial' }">{{ $t('tutorial.helpLink') }}</RouterLink>
    </p>
  </section>

  <section class="projects">
    <form class="name-form" @submit.prevent="saveName">
      <label for="display-name">{{ $t('welcome.nameLabel') }}</label>
      <input id="display-name" v-model="nameInput" maxlength="100" />
      <button type="submit" :disabled="savingName">{{ $t('welcome.nameSave') }}</button>
      <span v-if="nameSaved" class="name-note">{{ $t('welcome.nameSaved') }}</span>
      <span v-if="nameError" class="error">{{ nameError }}</span>
      <small class="name-note">{{ $t('welcome.nameHint') }}</small>
    </form>

    <h2>{{ $t('welcome.yourProjects') }}</h2>
    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="loaded && projects.length === 0" class="empty">
      {{ $t('welcome.empty') }}
    </p>

    <ul v-else class="project-list">
      <li v-for="project in projects" :key="project.id">
        <RouterLink :to="{ name: 'project', params: { slug: project.slug } }" class="project-link">
          <span class="title">{{ project.title }}</span>
          <span v-if="project.description" class="desc">{{ project.description }}</span>
        </RouterLink>
        <span class="role" :data-role="project.myRole">{{ project.myRole }}</span>
      </li>
    </ul>

    <p v-if="auth.isAdmin" class="admin-link">
      <RouterLink :to="{ name: 'admin-tools' }">{{ $t('welcome.manageLink') }}</RouterLink>
    </p>
  </section>
</template>

<style scoped>
.name-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.name-form small {
  flex-basis: 100%;
}
.name-note {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.welcome {
  text-align: center;
  padding: 1.5rem 0 2rem;
  border-bottom: 1px solid var(--border);
}
.logo {
  width: 8rem;
  height: auto;
  margin: 0 auto 1rem;
  display: block;
  background: #fff;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
}
.welcome h1 {
  margin: 0.5rem 0 1rem;
}
.intro {
  max-width: 36rem;
  margin: 0 auto 1rem;
  line-height: 1.55;
  color: var(--text-muted);
}
.help-link {
  font-size: 0.9rem;
}
.projects {
  margin-top: 2rem;
}
.project-list {
  list-style: none;
  padding: 0;
}
.project-list li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--border);
}
.project-link {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  text-decoration: none;
  color: inherit;
}
.project-link .title {
  font-weight: 500;
  color: var(--link, inherit);
  text-decoration: underline;
}
.project-link .desc {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.role {
  font-size: 0.7rem;
  text-transform: uppercase;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0.05rem 0.4rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.role[data-role='admin'] {
  color: #7c2d12;
  border-color: #c2410c;
}
.role[data-role='manager'] {
  color: #1e40af;
  border-color: #3b82f6;
}
.empty {
  color: var(--text-muted);
  font-size: 0.9rem;
  padding: 1rem 0;
}
.admin-link {
  margin-top: 1.5rem;
  font-size: 0.9rem;
}
.error {
  color: #c0392b;
}
</style>
