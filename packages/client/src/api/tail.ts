import type { TailEntry, TailEntryView } from '@wikitail/shared';
import { api } from './client';

export const tailApi = {
  list: (articleId: number) => api.get<TailEntryView[]>(`/articles/${articleId}/tail`),
  add: (articleId: number, input: { libraryItemId: number; commentary?: string | null }) =>
    api.post<TailEntry>(`/articles/${articleId}/tail`, input),
  updateCommentary: (entryId: number, commentary: string | null) =>
    api.patch<TailEntry>(`/tail-entries/${entryId}`, { commentary }),
  remove: (entryId: number) => api.delete<void>(`/tail-entries/${entryId}`),
  reorder: (articleId: number, entryIds: number[]) =>
    api.put<TailEntry[]>(`/articles/${articleId}/tail/order`, { entryIds }),
};
