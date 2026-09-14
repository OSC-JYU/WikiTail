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
  /** Declared content languages, ordered; the first is the project's primary. */
  languages: string[];
  createdBy: number;
  createdAt: string;
}

export type ArticleStatus = 'draft' | 'published';

export interface Article {
  id: number;
  projectId: number;
  slug: string;
  title: string;
  language: string;
  /** Language versions of the same article share this group. */
  translationGroupId: number;
  bodyMarkdown: string;
  status: ArticleStatus;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationGroup {
  id: number;
  projectId: number;
  /** null: show the "translation missing" invitation; set: show that article instead. */
  fallbackArticleId: number | null;
}

/** One language version within a translation group, for switching between versions. */
export interface ArticleVersion {
  id: number;
  language: string;
  slug: string;
  title: string;
  status: ArticleStatus;
}

export type SourceType = 'wikipedia' | 'wikidata' | 'commons' | 'finna' | 'local_upload';

export interface LibraryItem {
  id: number;
  ownerId: number;
  sourceType: SourceType;
  externalId: string | null;
  externalUrl: string | null;
  sourceRevision: string | null;
  /** null for language-neutral items such as a Commons image. */
  language: string | null;
  /** Ties language versions of one topic together, e.g. "wikidata:Q185187". */
  conceptId: string | null;
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

export interface ImportResult {
  item: LibraryItemSummary;
  /** Sibling language versions pulled in alongside the requested one. */
  siblings: LibraryItemSummary[];
}

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
  language?: string;
}

/** Fetched content from a source adapter, ready to persist as a LibraryItem. */
export interface SourceSnapshot {
  sourceType: SourceType;
  externalId: string;
  externalUrl: string;
  sourceRevision?: string;
  language?: string;
  conceptId?: string;
  /** Language code -> external id of the same concept on another wiki. */
  siblings?: Record<string, string>;
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
