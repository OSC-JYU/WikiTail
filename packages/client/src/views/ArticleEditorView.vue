<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { libraryShortcode, type Article, type ArticleVersion, type Project } from '@wikitail/shared';
import { articlesApi } from '../api/articles';
import { projectsApi } from '../api/projects';
import { tailApi } from '../api/tail';
import { useLibraryStore } from '../stores/library';
import WikiWorldTab from '../components/editor/WikiWorldTab.vue';
import MyLibraryTab from '../components/editor/MyLibraryTab.vue';
import CommonsTab from '../components/editor/CommonsTab.vue';
import LocalTab from '../components/editor/LocalTab.vue';
import TailEditor from '../components/editor/TailEditor.vue';
import ArticlePreview from '../components/editor/ArticlePreview.vue';

const props = defineProps<{ slug: string; id: string }>();
const router = useRouter();
const library = useLibraryStore();

// The Finna tab arrives with its adapter.
const tabs = ['Article', 'Wiki world', 'Commons', 'Local', 'Article library', 'Tail'] as const;
const activeTab = ref<(typeof tabs)[number]>('Article');

const article = ref<Article | null>(null);
const project = ref<Project | null>(null);
const versions = ref<ArticleVersion[]>([]);
const saving = ref(false);
const translating = ref(false);

/** Project languages this article has no version in yet. */
const missingLanguages = computed(() => {
  const have = new Set(versions.value.map((v) => v.language));
  return (project.value?.languages ?? []).filter((l) => !have.has(l));
});

async function load(id: number) {
  article.value = await articlesApi.get(id);
  [project.value, versions.value] = await Promise.all([
    projectsApi.get(props.slug),
    articlesApi.versions(id),
    // The library belongs to this article, so it is reloaded when the article
    // changes rather than carried over.
    library.fetchFor(id),
  ]);
}

onMounted(() => load(Number(props.id)));
watch(() => props.id, (id) => load(Number(id)));

/**
 * Appends a shortcode so the item renders inline in the article body. The label
 * is what makes the raw markdown readable, and what survives if the library row
 * is ever lost — the external id says more than a title where there is one.
 */
function insertLibraryRef(libraryItemId: number) {
  if (!article.value) return;
  const item = library.items.find((candidate) => candidate.id === libraryItemId);
  const body = article.value.bodyMarkdown;
  article.value.bodyMarkdown =
    (body.trim() ? `${body.replace(/\s+$/, '')}\n\n` : '') +
    libraryShortcode(libraryItemId, item?.externalId ?? item?.title) +
    '\n';
  activeTab.value = 'Article';
}

/** Which language the author is starting a translation in, or null when not translating. */
const translatingTo = ref<string | null>(null);
const translationTitle = ref('');
const copyTail = ref(true);
const tailSize = ref(0);

async function startTranslation(language: string) {
  translatingTo.value = language;
  translationTitle.value = article.value?.title ?? '';
  copyTail.value = true;
  tailSize.value = article.value ? (await tailApi.list(article.value.id)).length : 0;
}

async function addTranslation() {
  if (!article.value || !translatingTo.value || !translationTitle.value.trim()) return;
  translating.value = true;
  try {
    const created = await articlesApi.createTranslation(article.value.id, {
      language: translatingTo.value,
      title: translationTitle.value.trim(),
      copyTail: copyTail.value,
    });
    translatingTo.value = null;
    router.push({ name: 'article-edit', params: { slug: props.slug, id: created.id } });
  } finally {
    translating.value = false;
  }
}

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

    <div class="languages">
      <span class="label">Language versions:</span>
      <RouterLink
        v-for="version in versions"
        :key="version.id"
        :to="{ name: 'article-edit', params: { slug, id: version.id } }"
        class="version"
        :class="{ current: version.id === article.id }"
      >
        {{ version.language }}
      </RouterLink>
      <button
        v-for="language in missingLanguages"
        :key="language"
        class="add-version"
        :disabled="translating"
        @click="startTranslation(language)"
      >
        + {{ language }}
      </button>
    </div>

    <form v-if="translatingTo" class="translation-form" @submit.prevent="addTranslation">
      <h3>New {{ translatingTo }} version</h3>
      <input v-model="translationTitle" :placeholder="`Title in ${translatingTo}`" />
      <label v-if="tailSize > 0">
        <input v-model="copyTail" type="checkbox" />
        Copy the tail ({{ tailSize }} {{ tailSize === 1 ? 'entry' : 'entries' }}) as a starting point
        — items follow the new language automatically, the comments need translating.
      </label>
      <div class="translation-actions">
        <button type="submit" :disabled="translating">Create</button>
        <button type="button" @click="translatingTo = null">Cancel</button>
      </div>
    </form>

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
      <div class="editor-split">
        <textarea
          v-model="article.bodyMarkdown"
          class="body-input"
          rows="18"
          placeholder="Write in markdown… use [[library:N]] to embed library content"
        />
        <ArticlePreview :body="article.bodyMarkdown" />
      </div>
      <div class="actions">
        <button :disabled="saving" @click="save('draft')">Save draft</button>
        <button :disabled="saving" @click="save('published')">Publish</button>
        <span class="status">Status: {{ article.status }}</span>
      </div>
    </section>

    <section v-show="activeTab === 'Wiki world'">
      <WikiWorldTab
        :article-id="article.id"
        :language="article.language"
        :project-languages="project?.languages ?? []"
      />
    </section>

    <section v-show="activeTab === 'Commons'">
      <CommonsTab :article-id="article.id" />
    </section>

    <section v-show="activeTab === 'Local'">
      <LocalTab :article-id="article.id" />
    </section>

    <section v-show="activeTab === 'Article library'">
      <MyLibraryTab @insert="insertLibraryRef" />
    </section>

    <section v-show="activeTab === 'Tail'">
      <TailEditor :article-id="article.id" :language="article.language" />
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
.languages {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1rem;
  font-size: 0.8rem;
}
.languages .label {
  color: var(--text-muted);
}
.version,
.add-version {
  text-transform: uppercase;
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 3px;
  text-decoration: none;
  color: var(--text-muted);
  background: none;
}
.version.current {
  color: var(--text);
  border-color: currentColor;
  font-weight: 600;
}
.add-version {
  border-style: dashed;
}
.translation-form {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.75rem;
  margin-bottom: 1rem;
}
.translation-form h3 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
}
.translation-form input[type='text'],
.translation-form > input {
  width: 100%;
  padding: 0.45rem;
}
.translation-form label {
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0.6rem 0;
}
.translation-form label input {
  margin-top: 0.2rem;
}
.translation-actions {
  display: flex;
  gap: 0.5rem;
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
.editor-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  align-items: start;
}
@media (max-width: 720px) {
  .editor-split {
    grid-template-columns: 1fr;
  }
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
