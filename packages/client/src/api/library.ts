import type {
  LibraryItem,
  LibraryItemSummary,
  SourceSearchResult,
  SourceType,
} from '@wikitail/shared';
import { api } from './client';

export const libraryApi = {
  search: (sourceType: SourceType, q: string, limit = 10) =>
    api.get<SourceSearchResult[]>(
      `/sources/${sourceType}/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
  list: () => api.get<LibraryItemSummary[]>('/library'),
  get: (id: number) => api.get<LibraryItem>(`/library/${id}`),
  import: (sourceType: SourceType, externalId: string) =>
    api.post<LibraryItemSummary>('/library/import', { sourceType, externalId }),
};
