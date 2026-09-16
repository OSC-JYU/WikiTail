<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Article, Project, ProjectMember, SnapshotMode } from '@wikitail/shared';
import { DEFAULT_UPLOAD_LICENCE, UPLOAD_LICENCES } from '@wikitail/shared';
import { membersApi } from '../api/members';
import { projectsApi } from '../api/projects';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{ slug: string }>();
const router = useRouter();
const auth = useAuthStore();

const project = ref<Project | null>(null);
const articles = ref<Article[]>([]);
const members = ref<ProjectMember[]>([]);
const newTitle = ref('');
const newLanguage = ref('');
const newLicenseId = ref(DEFAULT_UPLOAD_LICENCE);
const creating = ref(false);
const languageInput = ref('');
const savingLanguages = ref(false);
const savingMode = ref(false);
const savingFinnaSetting = ref(false);
const error = ref<string | null>(null);

/**
 * Managers can change project settings; editors can only add articles. Admins
 * bypass membership entirely. We treat "unknown role" as read-only rather than
 * hiding the whole surface so a non-member still sees the article list.
 */
const myRole = computed(() => {
  if (auth.isAdmin) return 'admin' as const;
  return members.value.find((m) => m.userId === auth.user?.id)?.role ?? null;
});

const canEdit = computed(() => myRole.value !== null);
const canManage = computed(() => myRole.value === 'admin' || myRole.value === 'manager');

async function load() {
  project.value = await projectsApi.get(props.slug);
  articles.value = await projectsApi.listArticles(props.slug);
  newLanguage.value = project.value.languages[0] ?? '';
  languageInput.value = project.value.languages.join(', ');
  // Members endpoint is scoped to admins + members; non-members get 403.
  // Swallow it — the UI just doesn't show member-only controls.
  try {
    members.value = await membersApi.list(props.slug);
  } catch {
    members.value = [];
  }
}

onMounted(load);

async function createArticle() {
  if (!newTitle.value.trim()) return;
  creating.value = true;
  error.value = null;
  try {
    const article = await projectsApi.createArticle(props.slug, {
      title: newTitle.value.trim(),
      language: newLanguage.value,
      licenseId: newLicenseId.value,
    });
    newTitle.value = '';
    router.push({ name: 'article-edit', params: { slug: props.slug, id: article.id } });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not create article';
  } finally {
    creating.value = false;
  }
}

async function setSnapshotMode(mode: SnapshotMode) {
  savingMode.value = true;
  error.value = null;
  try {
    project.value = await projectsApi.setSnapshotMode(props.slug, mode);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not change that setting';
  } finally {
    savingMode.value = false;
  }
}

async function setFinnaAllowNonCommercial(allow: boolean) {
  savingFinnaSetting.value = true;
  error.value = null;
  try {
    project.value = await projectsApi.setFinnaAllowNonCommercial(props.slug, allow);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not change that setting';
  } finally {
    savingFinnaSetting.value = false;
  }
}

async function saveLanguages() {
  savingLanguages.value = true;
  error.value = null;
  try {
    project.value = await projectsApi.setLanguages(
      props.slug,
      languageInput.value.split(',').map((l) => l.trim()).filter(Boolean),
    );
    languageInput.value = project.value.languages.join(', ');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not update languages';
  } finally {
    savingLanguages.value = false;
  }
}
</script>

<template>
  <div v-if="project">
    <h1>{{ project.title }}</h1>
    <p v-if="project.description">{{ project.description }}</p>

    <p class="languages">
      Languages:
      <span v-for="language in project.languages" :key="language" class="lang">{{ language }}</span>
    </p>

    <p v-if="canEdit" class="members-link">
      <RouterLink :to="{ name: 'project-members', params: { slug: project.slug } }">
        Members ({{ members.length }}) →
      </RouterLink>
    </p>

    <p v-if="error" class="error">{{ error }}</p>

    <h2>Articles</h2>
    <ul class="article-list">
      <li v-for="article in articles" :key="article.id">
        <RouterLink :to="{ name: 'article-edit', params: { slug: project.slug, id: article.id } }">
          {{ article.title }}
        </RouterLink>
        <span class="meta">
          <span class="lang">{{ article.language }}</span>
          <span class="status">{{ article.status }}</span>
        </span>
      </li>
    </ul>
    <p v-if="articles.length === 0">No articles yet.</p>

    <form v-if="canEdit" class="new-article" @submit.prevent="createArticle">
      <input v-model="newTitle" placeholder="Article title" />
      <select v-model="newLanguage">
        <option v-for="language in project.languages" :key="language" :value="language">
          {{ language }}
        </option>
      </select>
      <select v-model="newLicenseId" title="Licence">
        <option v-for="licence in UPLOAD_LICENCES" :key="licence.id" :value="licence.id">
          {{ licence.name }}
        </option>
      </select>
      <button type="submit" :disabled="creating">Create article</button>
    </form>

    <section v-if="canManage" class="setting">
      <h2>Imported articles</h2>
      <label>
        <input
          type="radio"
          value="live_link"
          :checked="project.snapshotMode === 'live_link'"
          :disabled="savingMode"
          @change="setSnapshotMode('live_link')"
        />
        <span>
          <strong>Live links</strong> — keep only what is needed to link to an article. Readers see
          the current page from the source, which renders it better than a copy can.
        </span>
      </label>
      <label>
        <input
          type="radio"
          value="hard_copy"
          :checked="project.snapshotMode === 'hard_copy'"
          :disabled="savingMode"
          @change="setSnapshotMode('hard_copy')"
        />
        <span>
          <strong>Hard copies</strong> — also store the article text as it read when it was imported.
          An archive of what was cited, at roughly 150–350&nbsp;kB per article per language.
        </span>
      </label>
      <p class="hint">
        This applies to articles imported from now on. Copies already stored are left alone.
      </p>
    </section>

    <section v-if="canManage" class="setting">
      <h2>Finna NonCommercial material</h2>
      <label class="checkbox">
        <input
          type="checkbox"
          :checked="project.finnaAllowNonCommercial"
          :disabled="savingFinnaSetting"
          @change="setFinnaAllowNonCommercial(($event.target as HTMLInputElement).checked)"
        />
        <span>
          <strong>Copy in NonCommercial (CC BY-NC*) material</strong> when it is imported from Finna,
          instead of only linking to it. Still requires attribution and forbids commercial use —
          turn this off only if this project's deployment is itself commercial.
        </span>
      </label>
    </section>

    <form v-if="canManage" class="languages-form" @submit.prevent="saveLanguages">
      <h2>Project languages</h2>
      <p class="hint">
        Comma-separated. Authors may only write in these, and imports fetch these language versions.
        The first is the project's primary language.
      </p>
      <input v-model="languageInput" placeholder="fi, en" />
      <button type="submit" :disabled="savingLanguages">Save languages</button>
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
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}
.meta {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
}
.status {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
}
.lang {
  font-size: 0.7rem;
  text-transform: uppercase;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 0.3rem;
  color: var(--text-muted);
  margin-left: 0.3rem;
}
.languages {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.members-link {
  font-size: 0.85rem;
  margin: 0.25rem 0 1rem;
}
.new-article {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0 2rem;
}
.new-article input {
  flex: 1;
  padding: 0.5rem;
}
.setting {
  border-top: 1px solid var(--border);
  padding-top: 1rem;
  margin-top: 2rem;
}
.setting label {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin: 0.5rem 0;
  font-size: 0.9rem;
  line-height: 1.45;
}
.setting input {
  margin-top: 0.3rem;
}
.languages-form {
  border-top: 1px solid var(--border);
  padding-top: 1rem;
  margin-top: 1.5rem;
}
.languages-form input {
  padding: 0.5rem;
  margin-right: 0.5rem;
}
.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.error {
  color: #c0392b;
}
</style>
