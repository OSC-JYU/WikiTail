import type {
  LibraryItem,
  LibraryItemSummary,
  SourceSearchResult,
  SourceType,
  User,
} from '@wikitail/shared';
import { forbidden, notFound } from '../../lib/errors.js';
import { getAdapter } from '../sources/registry.js';
import { libraryRepository } from './repository.js';

export function searchSource(
  sourceType: SourceType,
  query: string,
  limit: number,
): Promise<SourceSearchResult[]> {
  return getAdapter(sourceType).search(query, { limit });
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
 * Fetches from the external source and stores a local snapshot. Re-importing
 * something already in the library returns the existing item rather than
 * duplicating it; refreshing snapshots is a separate, deliberate action (not
 * built yet).
 */
export async function importToLibrary(
  actor: User,
  sourceType: SourceType,
  externalId: string,
): Promise<LibraryItemSummary> {
  const existing = libraryRepository.findByExternalId(actor.id, sourceType, externalId);
  if (existing) return existing;

  const snapshot = await getAdapter(sourceType).importItem(externalId);

  return libraryRepository.create({
    ownerId: actor.id,
    sourceType: snapshot.sourceType,
    externalId: snapshot.externalId,
    externalUrl: snapshot.externalUrl,
    sourceRevision: snapshot.sourceRevision ?? null,
    title: snapshot.title,
    snapshotHtml: snapshot.html ?? null,
    snapshotJson: snapshot.json ? JSON.stringify(snapshot.json) : null,
    licenseName: snapshot.licenseName ?? null,
    licenseUrl: snapshot.licenseUrl ?? null,
    attributionText: snapshot.attributionText ?? null,
    importedBy: actor.id,
  });
}
