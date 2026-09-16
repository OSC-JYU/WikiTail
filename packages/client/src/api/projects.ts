import type { Article, Project, SnapshotMode } from '@wikitail/shared';
import { api } from './client';

export const projectsApi = {
  list: () => api.get<Project[]>('/projects'),
  get: (slug: string) => api.get<Project>(`/projects/${slug}`),
  create: (input: { title: string; description?: string; languages?: string[] }) =>
    api.post<Project>('/projects', input),
  setLanguages: (slug: string, languages: string[]) =>
    api.put<Project>(`/projects/${slug}/languages`, { languages }),
  setSnapshotMode: (slug: string, snapshotMode: SnapshotMode) =>
    api.put<Project>(`/projects/${slug}/snapshot-mode`, { snapshotMode }),
  setFinnaAllowNonCommercial: (slug: string, allow: boolean) =>
    api.put<Project>(`/projects/${slug}/finna-allow-noncommercial`, { allow }),
  setStyle: (slug: string, styleId: string) =>
    api.put<Project>(`/projects/${slug}/style`, { styleId }),
  setCustomCss: (slug: string, css: string | null) =>
    api.put<Project>(`/projects/${slug}/custom-css`, { css }),
  listArticles: (slug: string, language?: string) =>
    api.get<Article[]>(`/projects/${slug}/articles${language ? `?language=${language}` : ''}`),
  createArticle: (
    slug: string,
    input: { title: string; bodyMarkdown?: string; language?: string; licenseId?: string },
  ) => api.post<Article>(`/projects/${slug}/articles`, input),
};
