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

  /**
   * Uploads go through fetch directly rather than the JSON wrapper: the browser
   * has to set the multipart Content-Type itself so it can include the boundary.
   */
  async upload(file: File, fields: { title?: string; attributionText?: string } = {}) {
    const body = new FormData();
    if (fields.title) body.set('title', fields.title);
    if (fields.attributionText) body.set('attributionText', fields.attributionText);
    body.set('file', file);

    const res = await fetch('/api/library/upload', { method: 'POST', body });
    if (!res.ok) {
      const problem = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(problem.message ?? res.statusText);
    }
    return (await res.json()) as LibraryItemSummary;
  },
};
