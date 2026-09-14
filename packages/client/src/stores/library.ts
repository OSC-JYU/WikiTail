import { defineStore } from 'pinia';
import type { LibraryItemSummary, SourceType } from '@wikitail/shared';
import { libraryApi } from '../api/library';

/**
 * The library of the article being edited. It belongs to the article rather than
 * to a person, so switching articles replaces it rather than merging.
 */
export const useLibraryStore = defineStore('library', {
  state: () => ({
    items: [] as LibraryItemSummary[],
    articleId: null as number | null,
    loaded: false,
  }),
  getters: {
    externalIds: (state) => new Set(state.items.map((item) => item.externalId)),
  },
  actions: {
    async fetchFor(articleId: number) {
      this.items = await libraryApi.list(articleId);
      this.articleId = articleId;
      this.loaded = true;
    },
    async importItem(sourceType: SourceType, externalId: string, articleId: number) {
      const result = await libraryApi.import(sourceType, externalId, articleId);
      for (const item of [result.item, ...result.siblings]) {
        const existing = this.items.findIndex((i) => i.id === item.id);
        if (existing === -1) {
          this.items.unshift(item);
        } else {
          this.items[existing] = item;
        }
      }
      return result;
    },
  },
});
