<script setup lang="ts">
import { computed } from 'vue';
import { splitArticleBody } from '@wikitail/shared';
import { useLibraryStore } from '../../stores/library';
import { renderMarkdown } from '../../lib/markdown';
import { commonsEmbedFor } from '../../lib/commonsEmbed';
import MediaPreview from '../common/MediaPreview.vue';

const props = defineProps<{ body: string }>();
const library = useLibraryStore();

const segments = computed(() =>
  splitArticleBody(props.body).map((segment) =>
    segment.type === 'text'
      ? { kind: 'html' as const, html: renderMarkdown(segment.text) }
      : {
          kind: 'embed' as const,
          id: segment.libraryItemId,
          label: segment.label,
          item: library.items.find((i) => i.id === segment.libraryItemId),
        },
  ),
);
</script>

<template>
  <div class="preview">
    <template v-for="(segment, index) in segments" :key="index">
      <!-- Rendered from author markdown with html:false, so no raw HTML passes through. -->
      <div v-if="segment.kind === 'html'" class="prose" v-html="segment.html" />
      <div v-else-if="segment.item" class="embed">
        <!--
          Show the media whenever there is something to show — a stored file or
          a Commons audio/video embed player. Otherwise fall through to just the
          title and source link, which is what happens for wiki-page items.
        -->
        <MediaPreview
          v-if="segment.item.mediaUrl || commonsEmbedFor(segment.item)"
          :item="segment.item"
        />
        <strong>{{ segment.item.title }}</strong>
        <span v-if="segment.item.language" class="lang">{{ segment.item.language }}</span>
        <a
          v-if="segment.item.externalUrl"
          :href="segment.item.externalUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          source
        </a>
      </div>
      <div v-else class="embed missing">
        {{ segment.label ?? `Library item ${segment.id}` }} is not in your library
      </div>
    </template>
    <p v-if="segments.length === 0" class="empty">Nothing to preview yet.</p>
  </div>
</template>

<style scoped>
.preview {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.75rem;
  min-height: 6rem;
}
.prose :deep(img) {
  max-width: 100%;
}
.prose :deep(h1) {
  font-size: 1.4rem;
}
.prose :deep(h2) {
  font-size: 1.15rem;
}
.embed {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
  border-left: 3px solid var(--border);
  padding: 0.4rem 0.6rem;
  margin: 0.6rem 0;
  background: color-mix(in srgb, var(--text) 4%, transparent);
}
.embed.missing {
  color: #b7791f;
}
.lang {
  font-size: 0.7rem;
  text-transform: uppercase;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 0.3rem;
  color: var(--text-muted);
}
.empty {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
