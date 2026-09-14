<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { LibraryItem } from '@wikitail/shared';
import { libraryApi } from '../../api/library';
import { useLibraryStore } from '../../stores/library';
import LicenseBadge from '../common/LicenseBadge.vue';

const emit = defineEmits<{ insert: [libraryItemId: number] }>();

const library = useLibraryStore();
const selected = ref<LibraryItem | null>(null);
const loading = ref(false);

onMounted(() => {
  if (!library.loaded) library.fetchAll();
});

async function preview(id: number) {
  if (selected.value?.id === id) {
    selected.value = null;
    return;
  }
  loading.value = true;
  try {
    selected.value = await libraryApi.get(id);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <p v-if="library.loaded && library.items.length === 0">
    Nothing imported yet — use the Wiki world tab to search and import.
  </p>

  <ul class="items">
    <li v-for="item in library.items" :key="item.id">
      <div class="row-wrap">
        <button class="row" @click="preview(item.id)">
          <span class="title">{{ item.title }}</span>
          <span class="meta">
            <span v-if="item.language" class="lang">{{ item.language }}</span>
            <span class="source">{{ item.sourceType }}</span>
          </span>
        </button>
        <button class="insert" title="Embed in the article body" @click="emit('insert', item.id)">
          Insert
        </button>
      </div>

      <div v-if="selected?.id === item.id" class="preview">
        <LicenseBadge :item="item" />
        <!-- Sanitized server-side on import; see sources/wikipedia/sanitize.ts -->
        <div v-if="selected.snapshotHtml" class="snapshot" v-html="selected.snapshotHtml" />
      </div>
    </li>
  </ul>

  <p v-if="loading">Loading snapshot…</p>
</template>

<style scoped>
.items {
  list-style: none;
  padding: 0;
  margin: 0;
}
.items > li {
  border-bottom: 1px solid var(--border);
}
.row-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.insert {
  font-size: 0.8rem;
  padding: 0.2rem 0.5rem;
  flex-shrink: 0;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  width: 100%;
  padding: 0.6rem 0;
  background: none;
  border: none;
  text-align: left;
  color: inherit;
}
.title {
  font-weight: 500;
}
.meta {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  flex-shrink: 0;
}
.source {
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
}
.preview {
  padding-bottom: 1rem;
}
.snapshot {
  max-height: 24rem;
  overflow-y: auto;
  border: 1px solid var(--border);
  padding: 0.75rem;
  font-size: 0.9rem;
}
/* Imported markup carries no classes of its own, so constrain it here. */
.snapshot :deep(img) {
  max-width: 100%;
  height: auto;
}
.snapshot :deep(table) {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
}
.snapshot :deep(td),
.snapshot :deep(th) {
  border: 1px solid var(--border);
  padding: 0.25rem 0.4rem;
}
</style>
