<script setup lang="ts">
import { ref } from 'vue';
import type { FinnaMediaKind, SourceSearchResult } from '@wikitail/shared';
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
const loadingMore = ref(false);
const hasMore = ref(false);
const importingId = ref<string | null>(null);
const error = ref<string | null>(null);

/**
 * Which media kinds to search across. Images by default — that is what most
 * article-writers reach for — but the reader can add audio, video and text
 * (books, articles, PDFs) alongside. Empty means "images" too, so the search
 * never sends an empty type filter and returns nothing.
 */
const TYPES: FinnaMediaKind[] = ['image', 'audio', 'video', 'text'];
const selectedTypes = ref<FinnaMediaKind[]>(['image']);

/**
 * One page is 10 results — matches the original batch size. Finna paginates
 * by page number, and the adapter divides offset by limit; using a constant
 * limit means "Load more" always lands on a clean page boundary.
 */
const PAGE_SIZE = 10;

function toggleType(type: FinnaMediaKind) {
  const idx = selectedTypes.value.indexOf(type);
  if (idx >= 0) selectedTypes.value.splice(idx, 1);
  else selectedTypes.value.push(type);
}

async function search() {
  if (!query.value.trim()) return;
  searching.value = true;
  error.value = null;
  try {
    const page = await libraryApi.search('finna', query.value.trim(), {
      limit: PAGE_SIZE,
      language: props.language,
      types: selectedTypes.value.length ? selectedTypes.value : ['image'],
      articleId: props.articleId,
    });
    results.value = page.results;
    hasMore.value = page.hasMore;
    searched.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Search failed';
  } finally {
    searching.value = false;
  }
}

async function loadMore() {
  if (!query.value.trim() || loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  error.value = null;
  try {
    const page = await libraryApi.search('finna', query.value.trim(), {
      limit: PAGE_SIZE,
      offset: results.value.length,
      language: props.language,
      types: selectedTypes.value.length ? selectedTypes.value : ['image'],
      articleId: props.articleId,
    });
    results.value = [...results.value, ...page.results];
    hasMore.value = page.hasMore;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Search failed';
  } finally {
    loadingMore.value = false;
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
    <button type="submit" :disabled="searching">{{ searching ? $t('finna.searching') : $t('finna.search') }}</button>
  </form>

  <fieldset class="types">
    <legend>{{ $t('finna.searchIn') }}</legend>
    <label v-for="type in TYPES" :key="type" class="type">
      <input
        type="checkbox"
        :checked="selectedTypes.includes(type)"
        @change="toggleType(type)"
      />
      {{ $t(`finna.type.${type}`) }}
    </label>
  </fieldset>

  <p class="hint">{{ $t('finna.hint') }}</p>

  <p v-if="error" class="error">{{ error }}</p>

  <ul class="results">
    <li v-for="result in results" :key="result.externalId">
      <img v-if="result.thumbnailUrl" :src="result.thumbnailUrl" alt="" class="thumb" />
      <div class="body">
        <strong>{{ result.title }}</strong>
        <p class="meta">
          <!--
            Format label surfaces the media kind returned by Finna — "Photograph",
            "Book", "Sound Recording" — so a mixed-type search reads clearly.
          -->
          <span v-if="result.format" class="format">{{ result.format }}</span>
          <!-- The rights status decides whether importing copies the file or only
               links to it, so it is shown before the author chooses. -->
          <span
            v-if="result.snippet"
            class="snippet"
            :class="{ restricted: result.snippet.includes('link only') }"
          >
            {{ result.snippet }}
          </span>
        </p>
      </div>
      <button
        v-if="!library.externalIds.has(result.externalId)"
        :disabled="importingId === result.externalId"
        @click="importResult(result)"
      >
        {{ importingId === result.externalId ? $t('finna.importing') : $t('finna.import') }}
      </button>
      <span v-else class="in-library">{{ $t('finna.inLibrary') }}</span>
    </li>
  </ul>

  <!--
    Load-more button sits below the list rather than at the top, so it is
    reached by scrolling through the results and pressing it feels like the
    natural next step. Absent when there is nothing more to load.
  -->
  <button
    v-if="hasMore && !searching"
    class="load-more"
    :disabled="loadingMore"
    @click="loadMore"
  >
    {{ loadingMore ? $t('finna.loadingMore') : $t('finna.loadMore') }}
  </button>

  <p v-if="searched && results.length === 0 && !searching">{{ $t('finna.noResults') }}</p>
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
.types {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  align-items: center;
  border: none;
  padding: 0.25rem 0 0.6rem;
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
}
.types legend {
  padding: 0;
  color: var(--text-muted);
  font-size: 0.8rem;
  margin-right: 0.4rem;
}
.type {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
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
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
}
.format {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0.05rem 0.35rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.snippet {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.snippet.restricted {
  color: #b7791f;
}
.in-library {
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.load-more {
  display: block;
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.5rem;
  background: transparent;
  border: 1px dashed var(--border);
  cursor: pointer;
  color: var(--text-muted);
}
.load-more:hover:not(:disabled) {
  background: var(--surface-hover, rgba(0, 0, 0, 0.03));
}
.load-more:disabled {
  cursor: default;
  opacity: 0.6;
}
.error {
  color: #c0392b;
}
</style>
