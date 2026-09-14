<script setup lang="ts">
import type { LibraryItemSummary } from '@wikitail/shared';

/**
 * Credits an item the way Creative Commons asks: title, author, source and
 * licence, each linked where there is something to link to. Older items may only
 * carry the prose attribution the source supplied, so that is used as a fallback.
 */
const props = defineProps<{
  item: Pick<
    LibraryItemSummary,
    'title' | 'author' | 'licenseName' | 'licenseUrl' | 'attributionText' | 'externalUrl' | 'sourceRevision'
  >;
}>();

/**
 * Structured rendering needs an author to credit. Without one, the prose
 * attribution the source supplied is shown instead — it names them.
 */
const hasStructuredCredit = () => Boolean(props.item.author);
</script>

<template>
  <p class="license">
    <template v-if="hasStructuredCredit()">
      <a v-if="item.externalUrl" :href="item.externalUrl" target="_blank" rel="noopener noreferrer">
        {{ item.title }}
      </a>
      <span v-else class="title">{{ item.title }}</span>

      <span v-if="item.author">{{ $t('credit.by', { author: item.author }) }}</span>

      <template v-if="item.licenseName">
        <span>·</span>
        <a v-if="item.licenseUrl" :href="item.licenseUrl" target="_blank" rel="noopener noreferrer">
          {{ item.licenseName }}
        </a>
        <span v-else>{{ item.licenseName }}</span>
      </template>
    </template>

    <template v-else>
      <span v-if="item.attributionText">{{ item.attributionText }}</span>
      <a v-if="item.externalUrl" :href="item.externalUrl" target="_blank" rel="noopener noreferrer">
        {{ $t('browse.viewSource') }}
      </a>
    </template>

    <span v-if="item.sourceRevision" class="revision">rev {{ item.sourceRevision }}</span>
  </p>
</template>

<style scoped>
.license {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
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
