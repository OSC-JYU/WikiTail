<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { libraryShortcode, type Article, type ArticleVersion, type Project } from '@wikitail/shared';
import { articlesApi } from '../api/articles';
import { projectsApi } from '../api/projects';
import { tailApi } from '../api/tail';
import { useLibraryStore } from '../stores/library';
import WikiWorldTab from '../components/editor/WikiWorldTab.vue';
import MyLibraryTab from '../components/editor/MyLibraryTab.vue';
import CommonsTab from '../components/editor/CommonsTab.vue';
import LocalTab from '../components/editor/LocalTab.vue';
import FinnaTab from '../components/editor/FinnaTab.vue';
import TailEditor from '../components/editor/TailEditor.vue';
import ArticlePreview from '../components/editor/ArticlePreview.vue';
import MarkdownHelp from '../components/editor/MarkdownHelp.vue';

const props = defineProps<{ slug: string; id: string }>();
const router = useRouter();
const { t } = useI18n();
const library = useLibraryStore();

// Core tabs — the article and what belongs to it — are the ones an author moves
// between while writing. The source tabs on the other side of the separator
// are where material is *brought in* from; grouping them apart makes that
// distinction visible in the tab bar itself.
type Tab =
  | 'Article'
  | 'Article library'
  | 'Tail'
  | 'Wiki world'
  | 'Commons'
  | 'Finna'
  | 'Local';
const coreTabs: readonly Tab[] = ['Article', 'Article library', 'Tail'];
const sourceTabs: readonly Tab[] = ['Wiki world', 'Commons', 'Finna', 'Local'];
const activeTab = ref<Tab>('Article');

/** Side-drawer that shows the article library next to the editor while writing. */
const libraryDrawerOpen = ref(false);
const bodyRef = useTemplateRef<HTMLTextAreaElement>('body');

const article = ref<Article | null>(null);
const project = ref<Project | null>(null);
const versions = ref<ArticleVersion[]>([]);
const saving = ref(false);
const translating = ref(false);

/** Title and body as last loaded or saved, to tell whether there is anything unsaved. */
const savedSnapshot = ref({ title: '', body: '' });

function markSaved() {
  if (!article.value) return;
  savedSnapshot.value = { title: article.value.title, body: article.value.bodyMarkdown };
}

const hasUnsavedChanges = computed(
  () =>
    !!article.value &&
    (article.value.title !== savedSnapshot.value.title ||
      article.value.bodyMarkdown !== savedSnapshot.value.body),
);

/** Set while leaving on purpose (e.g. after deleting), so the guard stays quiet. */
let skipLeaveGuard = false;

function confirmLeave(): boolean {
  return skipLeaveGuard || !hasUnsavedChanges.value || window.confirm(t('editorNotice.unsavedConfirm'));
}

onBeforeRouteLeave(() => confirmLeave());
// Switching to another language version reuses this component, so it is not a "leave".
onBeforeRouteUpdate(() => confirmLeave());

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (hasUnsavedChanges.value) event.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload));

const notice = ref<{ text: string; kind: 'success' | 'error' } | null>(null);
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function notify(text: string, kind: 'success' | 'error') {
  notice.value = { text, kind };
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (notice.value = null), kind === 'error' ? 6000 : 3000);
}
onBeforeUnmount(() => clearTimeout(noticeTimer));

/** Project languages this article has no version in yet. */
const missingLanguages = computed(() => {
  const have = new Set(versions.value.map((v) => v.language));
  return (project.value?.languages ?? []).filter((l) => !have.has(l));
});

async function load(id: number) {
  article.value = await articlesApi.get(id);
  markSaved();
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
 * Inserts a shortcode so the item renders inline in the article body. The label
 * is what makes the raw markdown readable, and what survives if the library row
 * is ever lost — the external id says more than a title where there is one.
 *
 * It goes at the textarea's cursor, which the browser keeps while the textarea is
 * hidden behind another tab. The Article tab is then shown with the cursor after
 * the new shortcode.
 */
function insertLibraryRef(libraryItemId: number) {
  const textarea = bodyRef.value;
  if (!article.value || !textarea) return;
  const item = library.items.find((candidate) => candidate.id === libraryItemId);
  const shortcode = libraryShortcode(libraryItemId, item?.externalId ?? item?.title);
  const body = article.value.bodyMarkdown;

  // Embeds are block-level (see splitArticleBody), so the shortcode needs blank
  // lines around it or markdown will fold it into the surrounding paragraph.
  const before = body.slice(0, textarea.selectionStart);
  const after = body.slice(textarea.selectionEnd);
  const leading =
    before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trailing =
    after.length === 0 ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const insertion = `${leading}${shortcode}${trailing}`;
  article.value.bodyMarkdown = before + insertion + after;
  const cursor = before.length + insertion.length;

  activeTab.value = 'Article';
  nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
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
    markSaved();
    notify(t(status === 'published' ? 'editorNotice.published' : 'editorNotice.draftSaved'), 'success');
  } catch (e) {
    notify(t('editorNotice.saveFailed', { message: e instanceof Error ? e.message : '' }), 'error');
  } finally {
    saving.value = false;
  }
}

const deleting = ref(false);

async function deleteArticle() {
  if (!article.value) return;
  const isLast = versions.value.length <= 1;
  const message = isLast
    ? `Delete "${article.value.title}"? This is the only language version, so its library and tail are deleted too. This cannot be undone.`
    : `Delete the ${article.value.language} version "${article.value.title}" and its tail? Other language versions are kept. This cannot be undone.`;
  if (!window.confirm(message)) return;
  deleting.value = true;
  try {
    await articlesApi.remove(article.value.id);
    skipLeaveGuard = true;
    await router.push({ name: 'project', params: { slug: props.slug } });
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div v-if="article">
    <nav class="crumbs">
      <RouterLink :to="{ name: 'project', params: { slug } }">&larr; back to project</RouterLink>
      <!-- Only published articles exist publicly, so the link appears when there
           is something to look at. -->
      <RouterLink
        v-if="article.status === 'published'"
        class="view-link"
        :to="{
          name: 'browse-article',
          params: { project: slug, language: article.language, article: article.slug },
        }"
      >
        {{ $t('nav.viewPublished') }} &rarr;
      </RouterLink>
      <span v-else class="draft-note">{{ $t('nav.draftNotPublic') }}</span>
    </nav>

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
        v-for="tab in coreTabs"
        :key="tab"
        class="tab core"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
      <span class="tab-separator" aria-hidden="true" />
      <button
        v-for="tab in sourceTabs"
        :key="tab"
        class="tab source"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </nav>

    <section v-show="activeTab === 'Article'">
      <div class="editor-toolbar">
        <button
          type="button"
          class="drawer-toggle"
          :class="{ open: libraryDrawerOpen }"
          @click="libraryDrawerOpen = !libraryDrawerOpen"
        >
          {{ libraryDrawerOpen ? 'Hide library' : 'Show library' }}
        </button>
        <span v-if="libraryDrawerOpen" class="drawer-hint">
          Click Insert on any item to drop it at your cursor.
        </span>
        <MarkdownHelp />
      </div>
      <div class="editor-split" :class="{ 'with-drawer': libraryDrawerOpen }">
        <textarea
          ref="body"
          v-model="article.bodyMarkdown"
          class="body-input"
          placeholder="Write in markdown… use [[library:N]] to embed library content"
        />
        <div class="preview-pane">
          <ArticlePreview :body="article.bodyMarkdown" />
        </div>
        <aside v-if="libraryDrawerOpen" class="library-drawer">
          <div class="drawer-head">
            <h3>Article library</h3>
            <button
              type="button"
              class="drawer-close"
              title="Close library"
              @click="libraryDrawerOpen = false"
            >
              ×
            </button>
          </div>
          <MyLibraryTab @insert="insertLibraryRef" />
        </aside>
      </div>
      <div class="actions">
        <button :disabled="saving" @click="save('draft')">Save draft</button>
        <button :disabled="saving" @click="save('published')">Publish</button>
        <span class="status">Status: {{ article.status }}</span>
        <span v-if="hasUnsavedChanges" class="status unsaved">{{ $t('editorNotice.unsaved') }}</span>
        <button class="delete" :disabled="deleting || saving" @click="deleteArticle">Delete</button>
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

    <section v-show="activeTab === 'Finna'">
      <FinnaTab :article-id="article.id" :language="article.language" />
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

    <div
      v-if="notice"
      class="toast"
      :class="notice.kind"
      :role="notice.kind === 'error' ? 'alert' : 'status'"
    >
      {{ notice.text }}
    </div>
  </div>
</template>

<style scoped>
.crumbs {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.9rem;
}
.view-link {
  font-weight: 600;
}
.draft-note {
  font-size: 0.8rem;
  color: var(--text-muted);
}
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
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.tabs .tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  padding: 0.5rem 0.75rem;
}
.tabs .tab.active {
  color: var(--text);
  border-bottom-color: currentColor;
  font-weight: 500;
}
/* Source tabs (Wiki world, Commons, Finna, Local) are the *bringing in* tools,
   set slightly apart from the article/library/tail group so the tab bar reads
   as two intents rather than one flat list. */
.tabs .tab.source {
  font-size: 0.9rem;
  opacity: 0.85;
}
.tab-separator {
  display: inline-block;
  width: 1px;
  align-self: stretch;
  background: var(--border);
  margin: 0.35rem 0.5rem;
}
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}
.editor-toolbar :deep(.markdown-help) {
  margin-left: auto;
}
.drawer-toggle {
  font-size: 0.85rem;
  padding: 0.25rem 0.6rem;
}
.drawer-toggle.open {
  font-weight: 600;
}
.drawer-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.editor-split {
  /* Leaves room for the header, tabs and action buttons so those stay on screen. */
  --pane-height: max(18rem, calc(100dvh - 25rem));
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  align-items: start;
}
.editor-split.with-drawer {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
}
@media (max-width: 960px) {
  .editor-split.with-drawer {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 720px) {
  .editor-split {
    grid-template-columns: 1fr;
  }
}
.library-drawer {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  max-height: var(--pane-height);
  overflow: auto;
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.5rem;
}
.drawer-head h3 {
  margin: 0;
  font-size: 0.95rem;
}
.drawer-close {
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  line-height: 1;
  padding: 0.1rem 0.4rem;
}
.body-input {
  display: block;
  width: 100%;
  height: var(--pane-height);
  box-sizing: border-box;
  resize: none;
  font-family: monospace;
  padding: 0.5rem;
}
/* Fixed height keeps the buttons under the editor however long the text gets. */
.preview-pane {
  height: var(--pane-height);
  box-sizing: border-box;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.preview-pane :deep(.preview) {
  border: none;
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
.delete {
  margin-left: auto;
  color: #b00020;
}
.unsaved {
  color: #b36200;
}
.toast {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 50;
  max-width: 24rem;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  color: #fff;
  background: #1f6f43;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
}
.toast.error {
  background: #b00020;
}
</style>
