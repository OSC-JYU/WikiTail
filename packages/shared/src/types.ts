export type UserRole = 'admin' | 'author';

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
}

/**
 * Project-scoped role, distinct from `UserRole`. Global admins bypass this
 * entirely — they can edit and manage any project without appearing in
 * `project_members`.
 */
export type ProjectMemberRole = 'editor' | 'manager';

export interface ProjectMember {
  userId: number;
  email: string;
  displayName: string | null;
  role: ProjectMemberRole;
  createdAt: string;
}

/**
 * Outcome of a batch add: emails are partitioned so the UI can show what
 * actually happened rather than a single "done" message. Order within each
 * bucket matches the input order.
 */
export interface BatchAddMembersResult {
  added: ProjectMember[];
  /** Emails that had no user yet — a new `author` row was created for each. */
  createdUsers: string[];
  /** Emails that were already members of this project. */
  alreadyMembers: string[];
  /** Malformed entries — kept so the user can fix them and retry. */
  invalid: string[];
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
  /**
   * Whether importing a Finna item under a NonCommercial licence (CC BY-NC*)
   * copies the file into the library, rather than only linking to it. True by
   * default — a project that is run commercially can turn it off.
   */
  finnaAllowNonCommercial: boolean;
  createdBy: number;
  createdAt: string;
}

/**
 * A project the current user has some access to, tagged with the role they hold
 * on it. `admin` is granted implicitly to global admins even without a
 * membership row.
 */
export interface MyProject extends Project {
  myRole: 'admin' | ProjectMemberRole;
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
  /** One of UPLOAD_LICENCES' ids (see licences.ts) — chosen when the article is created. */
  licenseId: string;
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
  /** Human-readable format label as reported by the source, e.g. "Photograph", "Book". */
  format?: string;
}

/**
 * One page of search results plus whether the source says there is more to
 * fetch. Callers page by requesting the next `limit` starting at `offset`
 * equal to the number of results they already have; `hasMore` is false when
 * the source has run out of matches or does not report a total.
 */
export interface SourceSearchPage {
  results: SourceSearchResult[];
  hasMore: boolean;
}

/**
 * Media kinds a Finna search can be scoped to. `text` maps to Finna's `Text`
 * facet (books, articles, PDFs and other written material).
 */
export type FinnaMediaKind = 'image' | 'audio' | 'video' | 'text';

/**
 * Media kinds a Commons search can be scoped to. Maps to CirrusSearch's
 * `filetype:` keyword — images are bitmap+drawing, audio and video are their
 * own top-level kinds. Commons has no text-search facet.
 */
export type CommonsMediaKind = 'image' | 'audio' | 'video';

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
