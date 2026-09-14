import type { Article, Project } from '@wikitail/shared';
import { api } from './client';

export const projectsApi = {
  list: () => api.get<Project[]>('/projects'),
  get: (slug: string) => api.get<Project>(`/projects/${slug}`),
  create: (input: { title: string; description?: string }) => api.post<Project>('/projects', input),
  listArticles: (slug: string) => api.get<Article[]>(`/projects/${slug}/articles`),
  createArticle: (slug: string, input: { title: string; bodyMarkdown?: string }) =>
    api.post<Article>(`/projects/${slug}/articles`, input),
};
