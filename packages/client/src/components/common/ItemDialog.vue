<script setup lang="ts">
import { ref, watch } from 'vue';
import type { LibraryItem, LibraryItemSummary } from '@wikitail/shared';
import { libraryApi } from '../../api/library';
import { publicApi } from '../../api/public';
import LicenseBadge from './LicenseBadge.vue';
import MediaPreview from './MediaPreview.vue';

/**
 * Full view of one library item: a picture at the size it deserves, or the
 * stored copy of an article, without leaving the page.
 *
 * Built on <dialog> so Escape, the backdrop and focus handling come from the
 * browser rather than being reimplemented.
 */
const props = defineProps<{
  item: LibraryItemSummary | null;
  /** Which endpoint may serve the stored body — public pages have no session. */
  source?: 'public' | 'library';
}>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const full = ref<LibraryItem | null>(null);
const loading = ref(false);

watch(
  () => props.item,
  async (item) => {
    full.value = null;
    if (!item) {
      dialog.value?.close();
      return;
    }

    dialog.value?.showModal();

    // Bodies are fetched only when something is actually being read: a stored
    // article runs to a couple of hundred kilobytes.
    loading.value = true;
    try {
      full.value =
        props.source === 'public'
          ? await publicApi.libraryItem(item.id)
          : await libraryApi.get(item.id);
    } catch {
      full.value = null;
    } finally {
      loading.value = false;
    }
  },
);

/** A click landing on the dialog itself is a click on the backdrop. */
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) emit('close');
}
</script>

<template>
  <dialog ref="dialog" class="dialog" @close="emit('close')" @click="onClick">
    <div v-if="item" class="panel">
      <header>
        <strong>{{ item.title }}</strong>
        <button class="close" :aria-label="$t('dialog.close')" @click="emit('close')">×</button>
      </header>

      <div class="content">
        <MediaPreview v-if="item.mediaUrl" :item="item" class="media" />
        <p v-if="item.description" class="description">{{ item.description }}</p>

        <p v-if="loading" class="loading">…</p>
        <!-- Sanitized server-side on import; see sources/wikipedia/sanitize.ts -->
        <div v-else-if="full?.snapshotHtml" class="snapshot" v-html="full.snapshotHtml" />
      </div>

      <LicenseBadge :item="item" />
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  border: none;
  border-radius: 8px;
  padding: 0;
  width: min(64rem, 94vw);
  max-height: 92vh;
  background: var(--bg);
  color: var(--text);
}
.dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
}
.panel {
  display: flex;
  flex-direction: column;
  max-height: 92vh;
  padding: 1rem;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}
.close {
  border: none;
  background: none;
  color: inherit;
  font-size: 1.4rem;
  line-height: 1;
  padding: 0 0.3rem;
  cursor: pointer;
}
.content {
  overflow-y: auto;
  margin: 0.6rem 0;
}
.media :deep(img),
.media :deep(video) {
  max-height: 72vh;
  width: auto;
  max-width: 100%;
  margin: 0 auto;
}
.description {
  font-size: 0.95rem;
  color: var(--text-muted);
  margin: 0.6rem 0 0;
}
.snapshot {
  margin-top: 0.75rem;
  font-size: 0.95rem;
}
.snapshot :deep(img) {
  max-width: 100%;
  height: auto;
}
.snapshot :deep(table) {
  display: block;
  overflow-x: auto;
}
.loading {
  color: var(--text-muted);
}
</style>
