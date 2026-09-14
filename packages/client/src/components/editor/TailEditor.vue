<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import type { TailEntryView } from '@wikitail/shared';
import { tailApi } from '../../api/tail';
import { useLibraryStore } from '../../stores/library';
import LicenseBadge from '../common/LicenseBadge.vue';

const props = defineProps<{ articleId: number; language: string }>();

const library = useLibraryStore();
const entries = ref<TailEntryView[]>([]);
const adding = ref<number | null>(null);
const error = ref<string | null>(null);

async function load() {
  entries.value = await tailApi.list(props.articleId);
}

onMounted(load);
watch(() => props.articleId, load);

async function add(libraryItemId: number) {
  adding.value = libraryItemId;
  error.value = null;
  try {
    await tailApi.add(props.articleId, { libraryItemId });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not add to tail';
  } finally {
    adding.value = null;
  }
}

async function saveCommentary(entry: TailEntryView) {
  await tailApi.updateCommentary(entry.id, entry.commentary);
}

async function remove(entry: TailEntryView) {
  await tailApi.remove(entry.id);
  await load();
}

async function persistOrder() {
  await tailApi.reorder(
    props.articleId,
    entries.value.map((e) => e.id),
  );
}
</script>

<template>
  <p class="intro">
    The Tail is what readers see after the article — your pick of library content, each with your
    own comment. Drag to reorder.
  </p>

  <p v-if="error" class="error">{{ error }}</p>

  <VueDraggable v-model="entries" handle=".handle" class="tail" @end="persistOrder">
    <div v-for="entry in entries" :key="entry.id" class="entry">
      <span class="handle" title="Drag to reorder">⠿</span>
      <div class="body">
        <div class="head">
          <strong>{{ entry.item.title }}</strong>
          <span v-if="entry.item.language" class="lang">{{ entry.item.language }}</span>
          <span v-if="entry.shownInOtherLanguage" class="warn">
            no {{ language }} version — showing {{ entry.item.language }}
          </span>
        </div>
        <textarea
          v-model="entry.commentary"
          class="commentary"
          rows="2"
          placeholder="Say something about this…"
          @blur="saveCommentary(entry)"
        />
        <LicenseBadge :item="entry.item" />
      </div>
      <button class="remove" title="Remove from tail" @click="remove(entry)">×</button>
    </div>
  </VueDraggable>

  <p v-if="entries.length === 0" class="empty">Nothing in the tail yet.</p>

  <h3>Add from your library</h3>
  <ul class="library">
    <li v-for="item in library.items" :key="item.id">
      <span>{{ item.title }}</span>
      <span v-if="item.language" class="lang">{{ item.language }}</span>
      <button :disabled="adding === item.id" @click="add(item.id)">Add</button>
    </li>
  </ul>
  <p v-if="library.items.length === 0">
    Import something in the Wiki world tab first.
  </p>
</template>

<style scoped>
.intro,
.empty {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.tail {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0;
}
.entry {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.6rem;
}
.handle {
  cursor: grab;
  color: var(--text-muted);
  user-select: none;
  padding-top: 0.2rem;
}
.body {
  flex: 1;
  min-width: 0;
}
.head {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  flex-wrap: wrap;
}
.commentary {
  display: block;
  width: 100%;
  margin-top: 0.4rem;
  padding: 0.4rem;
}
.remove {
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.2rem 0.4rem;
}
.lang {
  font-size: 0.7rem;
  text-transform: uppercase;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 0.3rem;
  color: var(--text-muted);
}
.warn {
  font-size: 0.75rem;
  color: #b7791f;
}
.library {
  list-style: none;
  padding: 0;
}
.library li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--border);
}
.library li span:first-child {
  flex: 1;
}
.error {
  color: #c0392b;
}
</style>
