<script setup lang="ts">
import type { LibraryItemSummary, TailEntryView } from '@wikitail/shared';
import LicenseBadge from '../common/LicenseBadge.vue';
import MediaPreview from '../common/MediaPreview.vue';

defineProps<{ entry: TailEntryView }>();

// One dialog is owned by the page rather than one per card, so a feed of twenty
// cards does not carry twenty empty dialogs around.
const emit = defineEmits<{ view: [item: LibraryItemSummary] }>();
</script>

<template>
  <article class="card">
    <!-- The author's own words come first; the imported material supports them. -->
    <p v-if="entry.commentary" class="commentary">{{ entry.commentary }}</p>

    <button v-if="entry.item.mediaUrl" class="media-button" @click="emit('view', entry.item)">
      <MediaPreview :item="entry.item" />
    </button>
    <p v-if="entry.item.description" class="caption">{{ entry.item.description }}</p>

    <div class="source">
      <strong>{{ entry.item.title }}</strong>
      <span v-if="entry.item.language" class="lang">{{ entry.item.language }}</span>
      <span v-if="entry.shownInOtherLanguage" class="note">
        {{ $t('browse.shownIn', { language: entry.item.language }) }}
      </span>
    </div>

    <div class="actions">
      <button @click="emit('view', entry.item)">
        {{ entry.item.mediaUrl ? $t('dialog.view') : $t('browse.showSnapshot') }}
      </button>
    </div>

    <LicenseBadge :item="entry.item" />
  </article>
</template>

<style scoped>
.card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}
.commentary {
  font-size: 1.05rem;
  line-height: 1.5;
  margin: 0 0 0.75rem;
}
.media-button {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
}
.caption {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0.4rem 0 0.6rem;
}
.source {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  flex-wrap: wrap;
}
.lang {
  font-size: 0.7rem;
  text-transform: uppercase;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 0.3rem;
  color: var(--text-muted);
}
.note {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.6rem;
  font-size: 0.85rem;
}
.actions button {
  padding: 0.25rem 0.6rem;
  font-size: 0.85rem;
}
</style>
