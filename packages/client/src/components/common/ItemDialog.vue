<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
  item?: LibraryItemSummary | null;
  /** An outbound page opened in place of following the link. */
  page?: { title: string; url: string } | null;
  /** Which endpoint may serve the stored body — public pages have no session. */
  source?: 'public' | 'library';
}>();
const emit = defineEmits<{ close: [] }>();

/**
 * An item with no copy held here is read from the source. Which it is depends on
 * the project's setting at import time, so this follows the item rather than
 * assuming anything about where it came from.
 */
const livePage = computed(() => {
  if (props.page) return props.page.url;
  const item = props.item;
  return item && !item.hasSnapshot && !item.mediaUrl && item.externalUrl ? item.externalUrl : null;
});

const heading = computed(() => props.page?.title ?? props.item?.title ?? '');
const sourceUrl = computed(() => props.page?.url ?? props.item?.externalUrl ?? null);
const open = computed(() => Boolean(props.page ?? props.item));

const dialog = ref<HTMLDialogElement | null>(null);
const full = ref<LibraryItem | null>(null);
const loading = ref(false);

watch(
  () => [props.item, props.page],
  async () => {
    full.value = null;
    if (!open.value) {
      dialog.value?.close();
      return;
    }

    dialog.value?.showModal();
    const item = props.item;
    if (livePage.value || !item) return;

    // Bodies are fetched only when something is actually being read, and only
    // for sources that are not read live.
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
    <div v-if="open" class="panel">
      <header>
        <strong>{{ heading }}</strong>
        <span class="spacer" />
        <a
          v-if="sourceUrl"
          :href="sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="source-link"
        >
          {{ $t('browse.viewSource') }} ↗
        </a>
        <button class="close" :aria-label="$t('dialog.close')" @click="emit('close')">×</button>
      </header>

      <div class="content">
        <MediaPreview v-if="item?.mediaUrl" :item="item" class="media" />
        <p v-if="item?.description" class="description">{{ item.description }}</p>

        <!--
          Wikipedia is read live rather than from a stored copy: it renders its own
          article far better than our sanitized version can, it is always current,
          and Wikimedia permits framing (no X-Frame-Options, no frame-ancestors).
        -->
        <iframe
          v-if="livePage"
          :src="livePage"
          :title="heading"
          class="live"
          loading="lazy"
          referrerpolicy="no-referrer"
        />

        <template v-else>
          <p v-if="loading" class="loading">…</p>
          <!-- Sanitized server-side on import; see sources/wikipedia/sanitize.ts -->
          <div v-else-if="full?.snapshotHtml" class="snapshot" v-html="full.snapshotHtml" />
        </template>
      </div>

      <LicenseBadge v-if="item" :item="item" />
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
.live {
  width: 100%;
  height: 72vh;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
}
.spacer {
  flex: 1;
}
.source-link {
  font-size: 0.85rem;
  white-space: nowrap;
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
