import type { Readable } from 'node:stream';
import Boom from '@hapi/boom';
import type {
  ImportResult,
  LibraryItem,
  LibraryItemSummary,
  SourceSearchPage,
  SnapshotMode,
  SourceSnapshot,
  SourceType,
  User,
} from '@wikitail/shared';
import { DEFAULT_UPLOAD_LICENCE, findLicence } from '@wikitail/shared';
import { forbidden, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { articlesRepository } from '../articles/repository.js';
import { filesRepository } from '../files/repository.js';
import {
  isUploadable,
  kindFor,
  unlinkMedia,
  uploadableTypes,
  writeMedia,
  writeMediaStream,
} from '../files/storage.js';
import { assertCanEditArticle, canEdit } from '../projects/membership.js';
import { projectsRepository } from '../projects/repository.js';
import { getAdapter } from '../sources/registry.js';
import { libraryRepository } from './repository.js';

export function searchSource(
  sourceType: SourceType,
  query: string,
  limit: number,
  language?: string,
  types?: string[],
  offset?: number,
  articleId?: number,
): Promise<SourceSearchPage> {
  const allowNonCommercial = articleId !== undefined ? finnaAllowNonCommercialFor(articleId) : undefined;
  return getAdapter(sourceType).search(query, { limit, language, types, offset, allowNonCommercial });
}

/**
 * The library of an article, shared by its language versions and by everyone
 * working on it — gathering material is collaborative, so it is not scoped to
 * whoever happened to press Import.
 */
export function listLibrary(articleId: number): LibraryItemSummary[] {
  return libraryRepository.listByGroup(groupFor(articleId));
}

export function getLibraryItem(id: number): LibraryItem {
  const item = libraryRepository.findById(id);
  if (!item) notFound('Library item');
  return item;
}

function groupFor(articleId: number): number {
  const article = articlesRepository.findById(articleId);
  if (!article) notFound('Article');
  return article.translationGroupId;
}

function requireEditAccess(actor: User, articleId: number) {
  const article = articlesRepository.findById(articleId);
  if (!article) notFound('Article');
  assertCanEditArticle(actor, article);
  return article;
}

/** A library is shared by a translation group, so any owner of one of its versions may manage items. */
function assertCanEditItem(actor: User, translationGroupId: number): void {
  const group = articlesRepository.findGroup(translationGroupId);
  if (!group) return;
  const owner = articlesRepository.isOwnerInGroup(translationGroupId, actor.id);
  if (actor.role === 'admin' || (owner && canEdit(actor, group.projectId))) return;
  forbidden('Only the owner of this article can edit it');
}

/**
 * Fetches from the external source and stores a local snapshot. When the import
 * happens in the context of an article, the sibling language versions for that
 * project's languages are pulled in too, so a Finnish article can show the
 * Finnish page for the same concept.
 */
export async function importToLibrary(
  actor: User,
  sourceType: SourceType,
  externalId: string,
  articleId: number,
): Promise<ImportResult> {
  requireEditAccess(actor, articleId);
  const group = groupFor(articleId);
  const adapter = getAdapter(sourceType);
  // Whether this project keeps its own copy of an article or only links to it,
  // and whether Finna NonCommercial material is copied in rather than linked.
  const importOpts = {
    includeBody: snapshotModeFor(articleId) === 'hard_copy',
    allowNonCommercial: finnaAllowNonCommercialFor(articleId),
  };
  const existing = libraryRepository.findByExternalId(group, sourceType, externalId);

  // Re-importing does not re-fetch content, but sibling languages are still
  // resolved: the project may have gained a language since the first import.
  let item: LibraryItemSummary;
  let siblingIds: Record<string, string> | undefined;

  if (existing) {
    item = existing;
  } else {
    const snapshot = await adapter.importItem(externalId, importOpts);
    item = persist(actor, group, snapshot);
    siblingIds = snapshot.siblings ?? {};
  }

  const wanted = siblingLanguagesFor(articleId, item.language);
  if (wanted.length === 0) return { item, siblings: [] };

  if (!siblingIds) {
    const resolved = await adapter.resolveSiblings?.(externalId);
    siblingIds = resolved?.siblings ?? {};
    // Items imported before concepts were recorded get repaired in passing.
    if (!item.conceptId && resolved?.conceptId) {
      item = libraryRepository.setConcept(item.id, resolved.conceptId);
    }
  }

  const siblings: LibraryItemSummary[] = [];
  for (const language of wanted) {
    const siblingId = siblingIds[language];
    if (!siblingId) continue;
    const alreadyHave = libraryRepository.findByExternalId(group, sourceType, siblingId);
    if (alreadyHave) {
      siblings.push(alreadyHave);
      continue;
    }
    try {
      siblings.push(persist(actor, group, await adapter.importItem(siblingId, importOpts)));
    } catch (err) {
      // A concept with no page in that language, or a wiki hiccup, must not fail
      // the import the author actually asked for.
      logger.warn(`Sibling import failed for ${siblingId}`, err);
    }
  }

  return { item, siblings };
}

/**
 * Stores a file the author uploaded themselves. Unlike an imported item there is
 * no external source to attribute, so the title and any credit come from them.
 */
export async function uploadToLibrary(
  actor: User,
  articleId: number,
  input: {
    stream: Readable;
    mimeType: string;
    filename: string;
    title?: string;
    description?: string;
    author?: string;
    licenceId?: string;
  },
): Promise<LibraryItemSummary> {
  if (!isUploadable(input.mimeType)) {
    throw Boom.unsupportedMediaType(
      `${input.mimeType} cannot be uploaded. Allowed: ${uploadableTypes().join(', ')}`,
    );
  }

  requireEditAccess(actor, articleId);
  const group = groupFor(articleId);
  const licence = findLicence(input.licenceId ?? DEFAULT_UPLOAD_LICENCE);
  if (!licence) {
    throw Boom.badRequest(`Unknown licence: ${input.licenceId}`);
  }

  const { diskPath, byteSize } = await writeMediaStream(input.stream, input.mimeType);
  const file = filesRepository.create({
    ownerId: actor.id,
    diskPath,
    originalFilename: input.filename,
    mimeType: input.mimeType,
    byteSize,
    kind: kindFor(input.mimeType),
  });

  return libraryRepository.create({
    translationGroupId: group,
    sourceType: 'local_upload',
    externalId: null,
    externalUrl: null,
    sourceRevision: null,
    language: null,
    conceptId: null,
    title: input.title?.trim() || input.filename,
    description: input.description?.trim() || null,
    author: input.author?.trim() || actor.displayName || actor.email,
    snapshotHtml: null,
    snapshotJson: null,
    localFileId: file.id,
    licenseName: licence.name,
    licenseUrl: licence.url,
    attributionText: null,
    importedBy: actor.id,
  });
}

/**
 * Lets the owner add their own caption. Title, author and licence are editable
 * only for their own uploads: the licence and credit of imported work belong to
 * whoever made it, and are not ours to restate.
 */
export function updateLibraryItem(
  actor: User,
  id: number,
  input: { description?: string | null; title?: string; author?: string; licenceId?: string },
): LibraryItemSummary {
  const item = getLibraryItem(id);
  assertCanEditItem(actor, item.translationGroupId);
  const ownUpload = item.sourceType === 'local_upload';

  if (!ownUpload && (input.title || input.author || input.licenceId)) {
    throw Boom.badRequest('Imported items keep the title, credit and licence of their source');
  }

  const licence = input.licenceId ? findLicence(input.licenceId) : undefined;
  if (input.licenceId && !licence) {
    throw Boom.badRequest(`Unknown licence: ${input.licenceId}`);
  }

  return libraryRepository.updateDetails(id, {
    title: input.title?.trim() || item.title,
    description: input.description?.trim() || null,
    author: ownUpload ? input.author?.trim() || item.author : item.author,
    licenseName: licence ? licence.name : item.licenseName,
    licenseUrl: licence ? licence.url : item.licenseUrl,
    attributionText: item.attributionText,
  });
}

/**
 * Removes a library item, its `local_files` row, and the file it points at.
 * The item must be unreferenced everywhere — no tail entry may point at it and
 * no article body may embed it via `[[library:N]]`. Refusing rather than
 * cascading is deliberate: a tail entry or an embed is someone's editorial
 * choice, and dropping it silently because the reader deleted the underlying
 * source removes information the writer meant to keep.
 */
export function removeLibraryItem(actor: User, id: number): void {
  const item = getLibraryItem(id);
  assertCanEditItem(actor, item.translationGroupId);

  const usage = libraryRepository.countUsage(id);
  if (usage.tail > 0 || usage.body > 0) {
    // Split parts read better than a bare count: "still in 2 tails and 1
    // article body" tells the reader where to go and unlink it.
    const parts = [
      usage.tail > 0 ? `${usage.tail} tail entr${usage.tail === 1 ? 'y' : 'ies'}` : null,
      usage.body > 0 ? `${usage.body} article bod${usage.body === 1 ? 'y' : 'ies'}` : null,
    ].filter(Boolean);
    throw Boom.conflict(
      `Still referenced by ${parts.join(' and ')} — remove those first.`,
      { tail: usage.tail, body: usage.body },
    );
  }

  const diskPath = item.mediaUrl ? item.mediaUrl.replace(/^\/uploads\//, '') : null;
  libraryRepository.remove(id);
  // Disk cleanup runs last: if it fails, the database is already consistent and
  // the leftover file is a maintenance concern, not a correctness one.
  if (diskPath) {
    try {
      unlinkMedia(diskPath);
    } catch (err) {
      logger.warn(`Could not unlink ${diskPath} for removed library item ${id}`, err);
    }
  }
}

function persist(actor: User, group: number, snapshot: SourceSnapshot): LibraryItemSummary {
  // Media is stored on disk and referenced, rather than held in SQLite: binaries
  // are file-shaped, and hapi serves them straight from /uploads.
  let localFileId: number | null = null;
  if (snapshot.mediaFile) {
    const { buffer, mimeType, filename } = snapshot.mediaFile;
    const { diskPath } = writeMedia(buffer, mimeType);
    localFileId = filesRepository.create({
      ownerId: actor.id,
      diskPath,
      originalFilename: filename,
      mimeType,
      byteSize: buffer.byteLength,
      kind: kindFor(mimeType),
    }).id;
  }

  return libraryRepository.create({
    localFileId,
    translationGroupId: group,
    sourceType: snapshot.sourceType,
    externalId: snapshot.externalId,
    externalUrl: snapshot.externalUrl,
    sourceRevision: snapshot.sourceRevision ?? null,
    language: snapshot.language ?? null,
    conceptId: snapshot.conceptId ?? null,
    title: snapshot.title,
    description: null,
    author: snapshot.author ?? null,
    snapshotHtml: snapshot.html ?? null,
    snapshotJson: snapshot.json ? JSON.stringify(snapshot.json) : null,
    licenseName: snapshot.licenseName ?? null,
    licenseUrl: snapshot.licenseUrl ?? null,
    attributionText: snapshot.attributionText ?? null,
    importedBy: actor.id,
  });
}

function snapshotModeFor(articleId: number): SnapshotMode {
  const article = articlesRepository.findById(articleId);
  const project = article ? projectsRepository.findById(article.projectId) : undefined;
  return project?.snapshotMode ?? 'live_link';
}

/** Defaults to allowed (true) when the article/project cannot be resolved. */
function finnaAllowNonCommercialFor(articleId: number): boolean {
  const article = articlesRepository.findById(articleId);
  const project = article ? projectsRepository.findById(article.projectId) : undefined;
  return project?.finnaAllowNonCommercial ?? true;
}

/** The project's languages, minus the one just imported. */
function siblingLanguagesFor(articleId: number, imported: string | null): string[] {
  const article = articlesRepository.findById(articleId);
  if (!article) return [];
  const project = projectsRepository.findById(article.projectId);
  if (!project) return [];
  return project.languages.filter((language) => language !== imported);
}

/** Resolves a library item to its version in `language`, falling back to the item itself. */
export function resolveInLanguage(item: LibraryItemSummary, language: string): LibraryItemSummary {
  if (item.language === language || !item.conceptId) return item;
  return (
    libraryRepository.findByConcept(item.translationGroupId, item.conceptId, language) ?? item
  );
}
