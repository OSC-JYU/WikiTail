<script setup lang="ts">
import { ref } from 'vue';
import type { SourceSearchResult } from '@wikitail/shared';
import { libraryApi } from '../../api/library';
import { useLibraryStore } from '../../stores/library';

/** Search runs against the wiki for the article's language, and importing pulls in
 * the sibling versions for the project's other languages. */
const props = defineProps<{ articleId: number; language: string; projectLanguages: string[] }>();

const library = useLibraryStore();

const query = ref('');
const results = ref<SourceSearchResult[]>([]);
const searching = ref(false);
const searched = ref(false);
const importingId = ref<string | null>(null);
const error = ref<string | null>(null);
const lastImport = ref<string | null>(null);

async function search() {
  if (!query.value.trim()) return;
  searching.value = true;
  error.value = null;
  try {
    results.value = await libraryApi.search('wikipedia', query.value.trim(), {
      language: props.language,
    });
    searched.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Search failed';
  } finally {
    searching.value = false;
  }
}

async function importResult(result: SourceSearchResult) {
  importingId.value = result.externalId;
  error.value = null;
  lastImport.value = null;
  try {
    const { item, siblings } = await library.importItem(
      'wikipedia',
      result.externalId,
      props.articleId,
    );
    lastImport.value = siblings.length
      ? `Imported ${item.title} plus ${siblings.map((s) => `${s.title} (${s.language})`).join(', ')}`
      : `Imported ${item.title} — no other language version found`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Import failed';
  } finally {
    importingId.value = null;
  }
}
</script>

<template>
  <form class="search" @submit.prevent="search">
    <input v-model="query" :placeholder="`Search ${language}.wikipedia.org…`" />
    <button type="submit" :disabled="searching">{{ searching ? 'Searching…' : 'Search' }}</button>
  </form>

  <p class="hint">
    Searching in <strong>{{ language }}</strong
    >. Importing also fetches
    {{ projectLanguages.filter((l) => l !== language).join(', ') || 'no other language' }}.
  </p>

  <p v-if="error" class="error">{{ error }}</p>
  <p v-if="lastImport" class="imported-note">{{ lastImport }}</p>

  <ul class="results">
    <li v-for="result in results" :key="result.externalId">
      <img v-if="result.thumbnailUrl" :src="result.thumbnailUrl" alt="" class="thumb" />
      <div class="body">
        <strong>{{ result.title }}</strong>
        <p class="snippet">{{ result.snippet }}</p>
      </div>
      <button
        v-if="!library.externalIds.has(result.externalId)"
        :disabled="importingId === result.externalId"
        @click="importResult(result)"
      >
        {{ importingId === result.externalId ? 'Importing…' : 'Import' }}
      </button>
      <span v-else class="in-library">In library</span>
    </li>
  </ul>

  <p v-if="searched && results.length === 0 && !searching">No results.</p>
</template>

<style scoped>
.search {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.search input {
  flex: 1;
  padding: 0.5rem;
}
.results {
  list-style: none;
  padding: 0;
  margin: 0;
}
.results li {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}
.thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  flex-shrink: 0;
}
.body {
  flex: 1;
  min-width: 0;
}
.snippet {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0.25rem 0 0;
}
.in-library {
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.error {
  color: #c0392b;
}
.hint,
.imported-note {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0 0 0.75rem;
}
.imported-note {
  color: var(--text);
}
</style>
