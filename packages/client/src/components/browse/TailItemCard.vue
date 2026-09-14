<script setup lang="ts">
import { ref } from 'vue';
import type { TailEntryView } from '@wikitail/shared';
import { publicApi } from '../../api/public';
import LicenseBadge from '../common/LicenseBadge.vue';
import MediaPreview from '../common/MediaPreview.vue';

const props = defineProps<{ entry: TailEntryView }>();

const snapshot = ref<string | null>(null);
const open = ref(false);
const loading = ref(false);

async function toggle() {
  open.value = !open.value;
  if (open.value && snapshot.value === null) {
    loading.value = true;
    try {
      snapshot.value = (await publicApi.libraryItem(props.entry.item.id)).snapshotHtml ?? '';
    } finally {
      loading.value = false;
    }
  }
}
</script>

<template>
  <article class="card">
    <!-- The author's own words come first; the imported material supports them. -->
    <p v-if="entry.commentary" class="commentary">{{ entry.commentary }}</p>

    <MediaPreview v-if="entry.item.mediaUrl" :item="entry.item" class="card-media" />
    <p v-if="entry.item.description" class="caption">{{ entry.item.description }}</p>

    <div class="source">
      <strong>{{ entry.item.title }}</strong>
      <span v-if="entry.item.language" class="lang">{{ entry.item.language }}</span>
      <span v-if="entry.shownInOtherLanguage" class="note">
        {{ $t('browse.shownIn', { language: entry.item.language }) }}
      </span>
    </div>

    <div class="actions">
      <button v-if="!entry.item.mediaUrl" @click="toggle">
        {{ open ? $t('browse.hideSnapshot') : $t('browse.showSnapshot') }}
      </button>
    </div>

    <p v-if="loading" class="loading">…</p>
    <!-- Sanitized server-side at import; see sources/wikipedia/sanitize.ts -->
    <div v-if="open && snapshot" class="snapshot" v-html="snapshot" />

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
.card-media {
  margin-bottom: 0.4rem;
}
.caption {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0 0 0.6rem;
}
.commentary {
  font-size: 1.05rem;
  line-height: 1.5;
  margin: 0 0 0.75rem;
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
.snapshot {
  margin-top: 0.75rem;
  max-height: 60vh;
  overflow-y: auto;
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
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
