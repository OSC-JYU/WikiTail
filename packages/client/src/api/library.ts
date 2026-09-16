import type {
  CommonsMediaKind,
  FinnaMediaKind,
  ImportResult,
  LibraryItem,
  LibraryItemSummary,
  SourceSearchPage,
  SourceType,
} from '@wikitail/shared';
import { api } from './client';
import { BASE_URL } from '../lib/basePath';

export const libraryApi = {
  search: (
    sourceType: SourceType,
    q: string,
    /**
     * `types` is a source-specific filter. Finna understands
     * image/audio/video/text; Commons understands image/audio/video. The union
     * covers both — the server ignores unknown values for a given source.
     *
     * `offset` is the number of results the caller already has; the server
     * returns the next page starting there and reports whether more remain.
     */
    opts: {
      limit?: number;
      language?: string;
      types?: (FinnaMediaKind | CommonsMediaKind)[];
      offset?: number;
      /**
       * Only meaningful for Finna: lets the "link only" hint in results
       * reflect this article's project's finnaAllowNonCommercial setting
       * instead of a generic default.
       */
      articleId?: number;
    } = {},
  ) => {
    const params = new URLSearchParams({ q, limit: String(opts.limit ?? 10) });
    if (opts.language) params.set('language', opts.language);
    if (opts.offset) params.set('offset', String(opts.offset));
    if (opts.articleId) params.set('articleId', String(opts.articleId));
    // Multi-value URLSearchParams: `types=image&types=audio`. The server's Joi
    // schema uses `.single()`, so a single-value case still works.
    for (const type of opts.types ?? []) params.append('types', type);
    return api.get<SourceSearchPage>(`/sources/${sourceType}/search?${params}`);
  },
  list: (articleId: number) => api.get<LibraryItemSummary[]>(`/articles/${articleId}/library`),
  get: (id: number) => api.get<LibraryItem>(`/library/${id}`),
  update: (
    id: number,
    input: { description?: string | null; title?: string; author?: string; licenceId?: string },
  ) => api.patch<LibraryItemSummary>(`/library/${id}`, input),

  /**
   * Removes an unreferenced item. The server refuses with 409 when a tail
   * entry or an article body still embeds it — the reader is expected to go
   * and unpick those references first.
   */
  remove: (id: number) => api.delete<void>(`/library/${id}`),

  import: (sourceType: SourceType, externalId: string, articleId: number) =>
    api.post<ImportResult>('/library/import', { sourceType, externalId, articleId }),

  /**
   * Uploads go through fetch directly rather than the JSON wrapper: the browser
   * has to set the multipart Content-Type itself so it can include the boundary.
   */
  async upload(
    articleId: number,
    file: File,
    fields: { title?: string; description?: string; author?: string; licenceId?: string } = {},
  ) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value) body.set(key, value);
    }
    body.set('file', file);

    const res = await fetch(`${BASE_URL}api/articles/${articleId}/library/upload`, {
      method: 'POST',
      body,
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(problem.message ?? res.statusText);
    }
    return (await res.json()) as LibraryItemSummary;
  },
};
