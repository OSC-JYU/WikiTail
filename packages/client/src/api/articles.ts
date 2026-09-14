import type { Article, ArticleStatus, ArticleVersion } from '@wikitail/shared';
import { api } from './client';

export const articlesApi = {
  get: (id: number) => api.get<Article>(`/articles/${id}`),
  update: (id: number, input: { title: string; bodyMarkdown: string; status: ArticleStatus }) =>
    api.patch<Article>(`/articles/${id}`, input),
  versions: (id: number) => api.get<ArticleVersion[]>(`/articles/${id}/versions`),
  createTranslation: (
    id: number,
    input: { language: string; title: string; bodyMarkdown?: string; copyTail?: boolean },
  ) => api.post<Article>(`/articles/${id}/translations`, input),
};
