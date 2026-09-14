export type UserRole = 'admin' | 'author';

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
}

export interface Project {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  mainArticleId: number | null;
  createdBy: number;
  createdAt: string;
}

export type ArticleStatus = 'draft' | 'published';

export interface Article {
  id: number;
  projectId: number;
  slug: string;
  title: string;
  bodyMarkdown: string;
  status: ArticleStatus;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export type SourceType = 'wikipedia' | 'wikidata' | 'commons' | 'finna' | 'local_upload';

export interface LibraryItem {
  id: number;
  ownerId: number;
  sourceType: SourceType;
  externalId: string | null;
  externalUrl: string | null;
  sourceRevision: string | null;
  title: string;
  snapshotHtml: string | null;
  snapshotJson: unknown | null;
  localFileId: number | null;
  licenseName: string | null;
  licenseUrl: string | null;
  attributionText: string | null;
  importedAt: string;
  importedBy: number;
  createdAt: string;
}

/** Library listing shape — omits snapshot bodies, which can be hundreds of KB each. */
export type LibraryItemSummary = Omit<LibraryItem, 'snapshotHtml' | 'snapshotJson'>;

export type LocalFileKind = 'image' | 'audio' | 'video' | 'other';

export interface LocalFile {
  id: number;
  ownerId: number;
  diskPath: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  kind: LocalFileKind;
  createdAt: string;
}

export interface TailEntry {
  id: number;
  articleId: number;
  libraryItemId: number;
  commentary: string | null;
  position: number;
  createdAt: string;
}

/** Result of a search against a source adapter, before import. */
export interface SourceSearchResult {
  externalId: string;
  title: string;
  snippet?: string;
  thumbnailUrl?: string;
  sourceType: SourceType;
}

/** Fetched content from a source adapter, ready to persist as a LibraryItem. */
export interface SourceSnapshot {
  sourceType: SourceType;
  externalId: string;
  externalUrl: string;
  sourceRevision?: string;
  title: string;
  html?: string;
  json?: unknown;
  licenseName?: string;
  licenseUrl?: string;
  attributionText?: string;
  mediaFile?: {
    buffer: Uint8Array;
    mimeType: string;
    filename: string;
  };
}
