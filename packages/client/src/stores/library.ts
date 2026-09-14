import { defineStore } from 'pinia';
import type { LibraryItemSummary, SourceType } from '@wikitail/shared';
import { libraryApi } from '../api/library';

export const useLibraryStore = defineStore('library', {
  state: () => ({
    items: [] as LibraryItemSummary[],
    loaded: false,
  }),
  getters: {
    externalIds: (state) => new Set(state.items.map((item) => item.externalId)),
  },
  actions: {
    async fetchAll() {
      this.items = await libraryApi.list();
      this.loaded = true;
    },
    async importItem(sourceType: SourceType, externalId: string, articleId?: number) {
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
