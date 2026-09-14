import type { BrowseArticle, BrowseListing, LibraryItem, Project } from '@wikitail/shared';
import { api } from './client';

/** Read-only endpoints that work without a session — the public site. */
export const publicApi = {
  projects: () => api.get<Project[]>('/public/projects'),
  project: (slug: string) => api.get<Project>(`/public/projects/${slug}`),
  content: (slug: string, language: string) =>
    api.get<BrowseListing[]>(`/public/projects/${slug}/content?language=${language}`),
  article: (projectSlug: string, language: string, articleSlug: string) =>
    api.get<BrowseArticle>(`/public/projects/${projectSlug}/${language}/${articleSlug}`),
  libraryItem: (id: number) => api.get<LibraryItem>(`/public/library/${id}`),
};
