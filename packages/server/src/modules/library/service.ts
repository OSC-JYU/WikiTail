import type {
  ImportResult,
  LibraryItem,
  LibraryItemSummary,
  SourceSearchResult,
  SourceSnapshot,
  SourceType,
  User,
} from '@wikitail/shared';
import { forbidden, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { articlesRepository } from '../articles/repository.js';
import { filesRepository } from '../files/repository.js';
import { kindFor, writeMedia } from '../files/storage.js';
import { projectsRepository } from '../projects/repository.js';
import { getAdapter } from '../sources/registry.js';
import { libraryRepository } from './repository.js';

export function searchSource(
  sourceType: SourceType,
  query: string,
  limit: number,
  language?: string,
): Promise<SourceSearchResult[]> {
  return getAdapter(sourceType).search(query, { limit, language });
}

export function listLibrary(actor: User): LibraryItemSummary[] {
  return libraryRepository.listByOwner(actor.id);
}

export function getLibraryItem(actor: User, id: number): LibraryItem {
  const item = libraryRepository.findById(id);
  if (!item) notFound('Library item');
  if (item.ownerId !== actor.id) {
    forbidden('This library item belongs to another user');
  }
  return item;
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
  articleId?: number,
): Promise<ImportResult> {
  const adapter = getAdapter(sourceType);
  const existing = libraryRepository.findByExternalId(actor.id, sourceType, externalId);

  // Re-importing does not re-fetch content, but sibling languages are still
  // resolved: the project may have gained a language since the first import.
  let item: LibraryItemSummary;
  let siblingIds: Record<string, string> | undefined;

  if (existing) {
    item = existing;
  } else {
    const snapshot = await adapter.importItem(externalId);
    item = persist(actor, snapshot);
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
    const alreadyHave = libraryRepository.findByExternalId(actor.id, sourceType, siblingId);
    if (alreadyHave) {
      siblings.push(alreadyHave);
      continue;
    }
    try {
      siblings.push(persist(actor, await adapter.importItem(siblingId)));
    } catch (err) {
      // A concept with no page in that language, or a wiki hiccup, must not fail
      // the import the author actually asked for.
      logger.warn(`Sibling import failed for ${siblingId}`, err);
    }
  }

  return { item, siblings };
}

function persist(actor: User, snapshot: SourceSnapshot): LibraryItemSummary {
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
    ownerId: actor.id,
    sourceType: snapshot.sourceType,
    externalId: snapshot.externalId,
    externalUrl: snapshot.externalUrl,
    sourceRevision: snapshot.sourceRevision ?? null,
    language: snapshot.language ?? null,
    conceptId: snapshot.conceptId ?? null,
    title: snapshot.title,
    snapshotHtml: snapshot.html ?? null,
    snapshotJson: snapshot.json ? JSON.stringify(snapshot.json) : null,
    licenseName: snapshot.licenseName ?? null,
    licenseUrl: snapshot.licenseUrl ?? null,
    attributionText: snapshot.attributionText ?? null,
    importedBy: actor.id,
  });
}

/** The project's languages, minus the one just imported. */
function siblingLanguagesFor(articleId: number | undefined, imported: string | null): string[] {
  if (articleId === undefined) return [];
  const article = articlesRepository.findById(articleId);
  if (!article) return [];
  const project = projectsRepository.findById(article.projectId);
  if (!project) return [];
  return project.languages.filter((language) => language !== imported);
}

/** Resolves a library item to its version in `language`, falling back to the item itself. */
export function resolveInLanguage(
  actor: User,
  item: LibraryItemSummary,
  language: string,
): LibraryItemSummary {
  if (item.language === language || !item.conceptId) return item;
  return libraryRepository.findByConcept(actor.id, item.conceptId, language) ?? item;
}
