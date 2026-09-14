<script setup lang="ts">
import type { LibraryItemSummary } from '@wikitail/shared';

/** Renders a library item's stored media according to what kind of file it is. */
defineProps<{ item: Pick<LibraryItemSummary, 'mediaUrl' | 'mediaKind' | 'title'> }>();
</script>

<template>
  <img v-if="item.mediaKind === 'image'" :src="item.mediaUrl!" :alt="item.title" class="media" />
  <audio v-else-if="item.mediaKind === 'audio'" :src="item.mediaUrl!" controls class="media" />
  <video v-else-if="item.mediaKind === 'video'" :src="item.mediaUrl!" controls class="media" />
  <a v-else-if="item.mediaUrl" :href="item.mediaUrl" target="_blank" rel="noopener noreferrer">
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
</style>
