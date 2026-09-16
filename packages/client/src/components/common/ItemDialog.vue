<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { LibraryItem, LibraryItemSummary } from '@wikitail/shared';
import { libraryApi } from '../../api/library';
import { publicApi } from '../../api/public';
import LicenseBadge from './LicenseBadge.vue';
import MediaPreview from './MediaPreview.vue';
import { commonsEmbedFor } from '../../lib/commonsEmbed';
import { withBase } from '../../lib/basePath';

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
 *
 * Only Wikimedia sources are read via an iframe: Wikipedia and Wikidata leave
 * framing open. Finna sends `X-Frame-Options: DENY`, so a frame there just
 * shows a blank pane with a browser warning — those items fall through to
 * `externalLink` below and render as a plain link instead.
 */
const livePage = computed(() => {
  if (props.page) return props.page.url;
  const item = props.item;
  if (!item || item.hasSnapshot || item.mediaUrl || !item.externalUrl) return null;
  if (item.sourceType === 'wikipedia' || item.sourceType === 'wikidata') return item.externalUrl;
  return null;
});

/**
 * Commons audio and video in live-link projects have no local media — the
 * Commons player is embedded via iframe instead. Rendered at dialog scale,
 * taller than the inline article-body version.
 */
const commonsEmbed = computed(() => (props.item ? commonsEmbedFor(props.item) : null));

/**
 * The non-framable counterpart: an item read live from a source that refuses
 * embedding (Finna, and any future external source not on Wikimedia). Shown as
 * a link the reader can open in a new tab, since the browser will not let us
 * put the page inline.
 */
const externalLink = computed(() => {
  const item = props.item;
  if (!item || props.page || item.hasSnapshot || item.mediaUrl) return null;
  if (item.sourceType === 'wikipedia' || item.sourceType === 'wikidata') return null;
  if (commonsEmbed.value) return null;
  return item.externalUrl;
});

const heading = computed(() => props.page?.title ?? props.item?.title ?? '');
const sourceUrl = computed(() => props.page?.url ?? props.item?.externalUrl ?? null);
const open = computed(() => Boolean(props.page ?? props.item));

/**
 * A PDF is a document rather than a media element, so it needs an iframe (or a
 * plain link) — <video>/<img> would ignore it. Detected on the URL extension
 * because `mimeType` isn't on `LibraryItemSummary`. Both direct uploads and
 * future Finna text imports store PDFs with a `.pdf` filename.
 */
const pdfUrl = computed(() => {
  const url = props.item?.mediaUrl;
  return url && /\.pdf($|\?)/i.test(url) ? withBase(url) : null;
});

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
    if (livePage.value || externalLink.value || commonsEmbed.value || !item) return;

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
        <!--
          PDFs render inline via an iframe so the reader can page through the
          document without leaving the article. MediaPreview would fall back to
          a plain download link here — useful as a card thumbnail, not as the
          in-dialog view.
        -->
        <iframe
          v-if="pdfUrl"
          :src="pdfUrl"
          :title="heading"
          class="pdf"
          loading="lazy"
        />
        <!--
          Local file wins; otherwise the Commons player embed handles audio and
          video that were imported without a local copy. Without the embed
          branch, a live-link Commons audio item would open the dialog with
          nothing to play — only the source link would remain.
        -->
        <MediaPreview
          v-else-if="item && (item.mediaUrl || commonsEmbedFor(item))"
          :item="item"
          class="media"
        />
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

        <!--
          Commons audio and video (live-link projects): no local copy, embedded
          via the Commons player. Attribute set mirrors the copy-paste embed
          Commons hands out — the player's source selection depends on the
          declared intrinsic size, so width/height and frameborder are kept.
          Sized larger than the inline article-body version — the dialog exists
          precisely so a reader can watch or listen at a proper size.
        -->
        <iframe
          v-else-if="commonsEmbed"
          :src="commonsEmbed.url"
          :title="heading"
          :class="['embed', commonsEmbed.kind]"
          :width="commonsEmbed.kind === 'video' ? 960 : 480"
          :height="commonsEmbed.kind === 'video' ? 540 : 110"
          frameborder="0"
          loading="lazy"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowfullscreen
        />

        <!--
          Sources that refuse embedding (Finna, notably) get a plain link. The
          browser will not let us frame the page, so pushing a reader into a
          silently-broken iframe is worse than sending them out to it.
        -->
        <p v-else-if="externalLink" class="external">
          <a :href="externalLink" target="_blank" rel="noopener noreferrer">
            {{ heading }} ↗
          </a>
          <span class="external-hint">{{ $t('dialog.externalHint') }}</span>
        </p>

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
/*
 * PDF viewer. Full width, tall enough to give the browser's built-in reader
 * room to render. Same treatment as `.live` — different selector so a change
 * to one does not silently change the other.
 */
.pdf {
  width: 100%;
  height: 78vh;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
}
/*
 * Commons player embed. Video keeps its 16:9 aspect ratio at any width — a
 * stretched height confuses the player's source selection and the video stops
 * rendering. Audio is a control bar with Commons chrome, so kept short.
 */
.embed {
  width: 100%;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
}
.embed.video {
  aspect-ratio: 16 / 9;
  height: auto;
}
.embed.audio {
  height: 110px;
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
.external {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-subtle, transparent);
}
.external a {
  font-size: 1.05rem;
}
.external-hint {
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
