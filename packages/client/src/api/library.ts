import type {
  ImportResult,
  LibraryItem,
  LibraryItemSummary,
  SourceSearchResult,
  SourceType,
} from '@wikitail/shared';
import { api } from './client';

export const libraryApi = {
  search: (sourceType: SourceType, q: string, opts: { limit?: number; language?: string } = {}) => {
    const params = new URLSearchParams({ q, limit: String(opts.limit ?? 10) });
    if (opts.language) params.set('language', opts.language);
    return api.get<SourceSearchResult[]>(`/sources/${sourceType}/search?${params}`);
  },
  list: () => api.get<LibraryItemSummary[]>('/library'),
  get: (id: number) => api.get<LibraryItem>(`/library/${id}`),
  import: (sourceType: SourceType, externalId: string, articleId?: number) =>
    api.post<ImportResult>('/library/import', { sourceType, externalId, articleId }),
};
