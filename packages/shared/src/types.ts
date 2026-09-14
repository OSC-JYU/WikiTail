export type UserRole = 'admin' | 'author';

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
}

/**
 * Whether imported articles are copied here or only linked to. Media is always
 * copied either way — that is about not hotlinking, not about archiving text.
 */
export type SnapshotMode = 'hard_copy' | 'live_link';

export interface Project {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  mainArticleId: number | null;
  /** Declared content languages, ordered; the first is the project's primary. */
  languages: string[];
  snapshotMode: SnapshotMode;
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

/** Ties the language versions of one article together. */
export interface TranslationGroup {
  id: number;
  projectId: number;
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

export type LocalFileKind = 'image' | 'audio' | 'video' | 'other';

export interface LibraryItem {
  id: number;
  /** The article library this belongs to — shared by the article's language versions. */
  translationGroupId: number;
  sourceType: SourceType;
  externalId: string | null;
  externalUrl: string | null;
  sourceRevision: string | null;
  /** null for language-neutral items such as a Commons image. */
  language: string | null;
  /** Ties language versions of one topic together, e.g. "wikidata:Q185187". */
  conceptId: string | null;
  title: string;
  /** True when a copy of the body is held here, rather than only a link to it. */
  hasSnapshot: boolean;
  /** The author's own caption for this item, shown wherever it appears. */
  description: string | null;
  /** Who made the work, for citation — "Wikipedia contributors", a photographer's name. */
  author: string | null;
  snapshotHtml: string | null;
  snapshotJson: unknown | null;
  localFileId: number | null;
  /** Path to the stored media, when this item has a local file. */
  mediaUrl: string | null;
  mediaKind: LocalFileKind | null;
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

/** One translation group as a public reader in a given language sees it in a listing. */
export interface BrowseListing {
  translationGroupId: number;
  /** null when this article has no version in the requested language. */
  article: Article | null;
  availableLanguages: string[];
}

export interface BrowseArticle {
  project: Project;
  article: Article;
  tail: TailEntryView[];
  /** Library items the body embeds via [[library:N]], resolved to the article's language. */
  embeds: LibraryItemSummary[];
  versions: ArticleVersion[];
  requestedLanguage: string | null;
}

/** A tail entry with its library item already resolved to the article's language. */
export interface TailEntryView extends TailEntry {
  item: LibraryItemSummary;
  /**
   * Set when the article's language has no version of this item, so a different
   * language is being shown — the reader should be told which.
   */
  shownInOtherLanguage: boolean;
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
  /** Who made the work, for citation. */
  author?: string;
  attributionText?: string;
  mediaFile?: {
    buffer: Uint8Array;
    mimeType: string;
    filename: string;
  };
}
