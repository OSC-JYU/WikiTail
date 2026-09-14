import type { Article, ArticleStatus } from '@wikitail/shared';
import { api } from './client';

export const articlesApi = {
  get: (id: number) => api.get<Article>(`/articles/${id}`),
  update: (id: number, input: { title: string; bodyMarkdown: string; status: ArticleStatus }) =>
    api.patch<Article>(`/articles/${id}`, input),
};
