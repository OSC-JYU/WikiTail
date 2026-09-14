import Boom from '@hapi/boom';
import type { TailEntry, TailEntryView, User } from '@wikitail/shared';
import { forbidden, notFound } from '../../lib/errors.js';
import { articlesRepository } from '../articles/repository.js';
import { libraryRepository } from '../library/repository.js';
import { tailRepository } from './repository.js';

function requireArticle(articleId: number) {
  const article = articlesRepository.findById(articleId);
  if (!article) notFound('Article');
  return article;
}

function requireOwnership(actor: User, articleId: number) {
  const article = requireArticle(articleId);
  if (article.createdBy !== actor.id && actor.role !== 'admin') {
    forbidden('Only the author or an admin can curate this tail');
  }
  return article;
}

/**
 * Attaches each entry's library item, resolved to the article's language: an
 * entry added while writing in English shows the Finnish snapshot of the same
 * concept when read on the Finnish version.
 */
export function listTail(articleId: number): TailEntryView[] {
  const article = requireArticle(articleId);

  return tailRepository.listByArticle(articleId).flatMap((entry) => {
    const stored = libraryRepository.findSummaryById(entry.libraryItemId);
    if (!stored) return [];

    // Resolved within this article's own library, which its language versions
    // share — so the English version shows the English snapshot of the concept.
    const resolved =
      stored.conceptId && stored.language !== article.language
        ? (libraryRepository.findByConcept(
            stored.translationGroupId,
            stored.conceptId,
            article.language,
          ) ?? stored)
        : stored;

    return [
      {
        ...entry,
        item: resolved,
        shownInOtherLanguage: resolved.language !== null && resolved.language !== article.language,
      },
    ];
  });
}

export function addToTail(
  actor: User,
  articleId: number,
  input: { libraryItemId: number; commentary: string | null },
): TailEntry {
  const article = requireOwnership(actor, articleId);

  const item = libraryRepository.findSummaryById(input.libraryItemId);
  if (!item) notFound('Library item');
  if (item.translationGroupId !== article.translationGroupId) {
    throw Boom.badRequest('That item is in a different article library');
  }

  return tailRepository.create({ articleId, ...input });
}

export function updateTailEntry(actor: User, id: number, commentary: string | null): TailEntry {
  const entry = tailRepository.findById(id);
  if (!entry) notFound('Tail entry');
  requireOwnership(actor, entry.articleId);
  return tailRepository.updateCommentary(id, commentary);
}

export function removeTailEntry(actor: User, id: number): void {
  const entry = tailRepository.findById(id);
  if (!entry) notFound('Tail entry');
  requireOwnership(actor, entry.articleId);
  tailRepository.remove(id);
}

export function reorderTail(actor: User, articleId: number, orderedIds: number[]): TailEntry[] {
  requireOwnership(actor, articleId);

  const current = tailRepository.listByArticle(articleId).map((e) => e.id);
  const sameSet =
    current.length === orderedIds.length && current.every((id) => orderedIds.includes(id));
  if (!sameSet) {
    throw Boom.badRequest('The new order must list exactly the entries of this tail');
  }

  return tailRepository.reorder(articleId, orderedIds);
}
