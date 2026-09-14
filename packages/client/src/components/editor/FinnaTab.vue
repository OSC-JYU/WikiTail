<script setup lang="ts">
import { ref } from 'vue';
import type { SourceSearchResult } from '@wikitail/shared';
import { libraryApi } from '../../api/library';
import { useLibraryStore } from '../../stores/library';

/**
 * Finna aggregates Finnish archives, libraries and museums. Its records carry
 * every rights status there is, so each result says what may be done with it:
 * material that cannot be re-hosted is kept as a link to Finna instead.
 */
const props = defineProps<{ articleId: number; language: string }>();
const library = useLibraryStore();

const query = ref('');
const results = ref<SourceSearchResult[]>([]);
const searching = ref(false);
const searched = ref(false);
const importingId = ref<string | null>(null);
const error = ref<string | null>(null);

async function search() {
  if (!query.value.trim()) return;
  searching.value = true;
  error.value = null;
  try {
    results.value = await libraryApi.search('finna', query.value.trim(), {
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
  try {
    await library.importItem('finna', result.externalId, props.articleId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Import failed';
  } finally {
    importingId.value = null;
  }
}
</script>

<template>
  <form class="search" @submit.prevent="search">
    <input v-model="query" :placeholder="$t('finna.searchPlaceholder')" />
    <button type="submit" :disabled="searching">{{ searching ? 'Searching…' : 'Search' }}</button>
  </form>

  <p class="hint">{{ $t('finna.hint') }}</p>

  <p v-if="error" class="error">{{ error }}</p>

  <ul class="results">
    <li v-for="result in results" :key="result.externalId">
      <img v-if="result.thumbnailUrl" :src="result.thumbnailUrl" alt="" class="thumb" />
      <div class="body">
        <strong>{{ result.title }}</strong>
        <!-- The rights status decides whether importing copies the file or only
             links to it, so it is shown before the author chooses. -->
        <p v-if="result.snippet" class="snippet" :class="{ restricted: result.snippet.includes('link only') }">
          {{ result.snippet }}
        </p>
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
  margin-bottom: 0.5rem;
}
.search input {
  flex: 1;
  padding: 0.5rem;
}
.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0 0 1rem;
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
  width: 72px;
  height: 72px;
  object-fit: cover;
  flex-shrink: 0;
  border-radius: 3px;
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
.snippet.restricted {
  color: #b7791f;
}
.in-library {
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.error {
  color: #c0392b;
}
</style>
