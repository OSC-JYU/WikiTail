<script setup lang="ts">
import type { LibraryItemSummary } from '@wikitail/shared';

defineProps<{ item: Pick<LibraryItemSummary, 'licenseName' | 'licenseUrl' | 'attributionText' | 'externalUrl' | 'sourceRevision'> }>();
</script>

<template>
  <p class="license">
    <span v-if="item.attributionText">{{ item.attributionText }}</span>
    <a v-if="item.licenseUrl" :href="item.licenseUrl" target="_blank" rel="noopener noreferrer">
      {{ item.licenseName ?? 'License' }}
    </a>
    <a v-if="item.externalUrl" :href="item.externalUrl" target="_blank" rel="noopener noreferrer">
      {{ $t('browse.viewSource') }}
    </a>
    <span v-if="item.sourceRevision" class="revision">rev {{ item.sourceRevision }}</span>
  </p>
</template>

<style scoped>
.license {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.8rem;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
  padding-top: 0.5rem;
  margin-top: 0.5rem;
}
.revision {
  font-variant-numeric: tabular-nums;
}
</style>
