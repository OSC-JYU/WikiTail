<script setup lang="ts">
import { computed } from 'vue';
import type { LibraryItemSummary } from '@wikitail/shared';
import { commonsEmbedFor } from '../../lib/commonsEmbed';
import { withBase } from '../../lib/basePath';

/** Renders a library item's stored media according to what kind of file it is. */
const props = defineProps<{
  item: Pick<LibraryItemSummary, 'mediaUrl' | 'mediaKind' | 'title' | 'sourceType' | 'externalUrl'>;
}>();

/**
 * Live-link Commons audio/video has no local file: `mediaKind` is null (from
 * the missing `local_files` join) and `mediaUrl` is null. We derive both from
 * the Commons filename instead. When a local file *is* present, it wins — a
 * downloaded copy is faster and survives the source going offline.
 */
const embed = computed(() => commonsEmbedFor(props.item));
const kind = computed<'image' | 'audio' | 'video' | null>(() => {
  if (props.item.mediaKind === 'image' || props.item.mediaKind === 'audio' || props.item.mediaKind === 'video') {
    return props.item.mediaKind;
  }
  return embed.value?.kind ?? null;
});
const src = computed(() => withBase(props.item.mediaUrl) ?? embed.value?.url ?? null);
</script>

<template>
  <img
    v-if="kind === 'image' && src"
    :src="src"
    :alt="item.title"
    class="media"
  />
  <!--
    Audio and video play inline via the browser's native controls. For a
    Commons live-link item the `src` is `Special:FilePath/<title>`, which
    redirects to the current `upload.wikimedia.org` URL with the correct media
    MIME type — no cross-origin iframe, no MediaWiki page-load overhead, just a
    plain HTML5 player.
  -->
  <audio
    v-else-if="kind === 'audio' && src"
    :src="src"
    controls
    preload="metadata"
    class="media audio"
  />
  <video
    v-else-if="kind === 'video' && src"
    :src="src"
    controls
    preload="metadata"
    class="media video"
  />
  <a v-else-if="item.mediaUrl" :href="withBase(item.mediaUrl)" target="_blank" rel="noopener noreferrer">
    {{ item.title }}
  </a>
</template>

<style scoped>
.media {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
.audio {
  width: 100%;
}
.video {
  width: 100%;
  max-width: 640px;
}
</style>
