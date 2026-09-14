import type { Article, Project } from '@wikitail/shared';
import { api } from './client';

export const projectsApi = {
  list: () => api.get<Project[]>('/projects'),
  get: (slug: string) => api.get<Project>(`/projects/${slug}`),
  create: (input: { title: string; description?: string; languages?: string[] }) =>
    api.post<Project>('/projects', input),
  setLanguages: (slug: string, languages: string[]) =>
    api.put<Project>(`/projects/${slug}/languages`, { languages }),
  listArticles: (slug: string, language?: string) =>
    api.get<Article[]>(`/projects/${slug}/articles${language ? `?language=${language}` : ''}`),
  createArticle: (slug: string, input: { title: string; bodyMarkdown?: string; language?: string }) =>
    api.post<Article>(`/projects/${slug}/articles`, input),
};
