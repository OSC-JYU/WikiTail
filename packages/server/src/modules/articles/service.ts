import Boom from '@hapi/boom';
import type { Article, ArticleStatus, ArticleVersion, User } from '@wikitail/shared';
import { DEFAULT_UPLOAD_LICENCE, findLicence } from '@wikitail/shared';
import { notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { slugify } from '../../lib/slug.js';
import { db } from '../../db/connection.js';
import { unlinkMedia } from '../files/storage.js';
import { libraryRepository } from '../library/repository.js';
import { assertCanEdit, assertCanEditArticle, canViewDrafts } from '../projects/membership.js';
import { projectsRepository } from '../projects/repository.js';
import { assertLanguageAllowed } from '../projects/service.js';
import { tailRepository } from '../tail/repository.js';
import { articlesRepository } from './repository.js';

/** A translation group either has the requested language or it does not. */
export type ResolvedArticle =
  | { kind: 'match'; article: Article; versions: ArticleVersion[] }
  | { kind: 'missing'; requestedLanguage: string; versions: ArticleVersion[] };

function requireProject(projectId: number) {
  const project = projectsRepository.findById(projectId);
  if (!project) notFound('Project');
  return project;
}

export function listArticlesForProject(
  actor: User,
  projectId: number,
  language?: string,
): Article[] {
  requireProject(projectId);
  const seesDrafts = canViewDrafts(actor, projectId);
  const articles = articlesRepository
    .listByProject(projectId)
    .filter((a) => seesDrafts || a.status === 'published');
  return language ? articles.filter((a) => a.language === language) : articles;
}

export function getArticle(id: number): Article {
  const article = articlesRepository.findById(id);
  if (!article) notFound('Article');
  return article;
}

/**
 * The authed article endpoint (`GET /api/articles/{id}`) — same as {@link getArticle}
 * but hides drafts from non-members so signed-in visitors can't discover the
 * existence of unpublished work.
 */
export function getVisibleArticle(actor: User, id: number): Article {
  const article = getArticle(id);
  if (article.status !== 'published' && !canViewDrafts(actor, article.projectId)) {
    // 404, not 403 — non-members shouldn't learn the id exists.
    notFound('Article');
  }
  return article;
}

export function listVersions(actor: User, translationGroupId: number): ArticleVersion[] {
  const versions = articlesRepository.listVersions(translationGroupId);
  if (versions.length === 0) return versions;
  const first = articlesRepository.findById(versions[0]!.id);
  if (!first) return versions;
  const seesDrafts = canViewDrafts(actor, first.projectId);
  return seesDrafts ? versions : versions.filter((v) => v.status === 'published');
}

/**
 * Resolves a translation group for a reader in `language`. A missing version is
 * reported as missing rather than quietly replaced by another language — writing
 * the translation is the author's job, and the reader is told plainly.
 */
export function resolveInLanguage(
  actor: User,
  translationGroupId: number,
  language: string,
): ResolvedArticle {
  const group = articlesRepository.findGroup(translationGroupId);
  if (!group) notFound('Translation group');

  const seesDrafts = canViewDrafts(actor, group.projectId);
  const versions = articlesRepository
    .listVersions(translationGroupId)
    .filter((v) => seesDrafts || v.status === 'published');
  const match = versions.find((v) => v.language === language);
  const article = match ? articlesRepository.findById(match.id) : undefined;

  return article
    ? { kind: 'match', article, versions }
    : { kind: 'missing', requestedLanguage: language, versions };
}

export function createArticle(
  actor: User,
  projectId: number,
  input: { title: string; bodyMarkdown: string; language?: string; licenseId?: string },
): Article {
  const project = requireProject(projectId);
  assertCanEdit(actor, project.id);
  const language = input.language ?? project.languages[0];
  assertLanguageAllowed(project, language);

  const licenseId = input.licenseId ?? DEFAULT_UPLOAD_LICENCE;
  if (!findLicence(licenseId)) {
    throw Boom.badRequest(`Unknown licence: ${licenseId}`);
  }

  return articlesRepository.create({
    projectId,
    slug: slugify(input.title),
    title: input.title,
    language,
    bodyMarkdown: input.bodyMarkdown,
    licenseId,
    createdBy: actor.id,
  });
}

/**
 * Adds a new language version to an existing article's translation group.
 *
 * Tails belong to a single version, so a translation starts empty unless
 * `copyTail` is set — which duplicates the source's entries and commentary as a
 * draft for the translator, rather than making them curate the list again.
 */
export function createTranslation(
  actor: User,
  sourceArticleId: number,
  input: { language: string; title: string; bodyMarkdown: string; copyTail?: boolean },
): Article {
  const source = getArticle(sourceArticleId);
  const project = requireProject(source.projectId);
  assertCanEdit(actor, project.id);
  assertLanguageAllowed(project, input.language);

  if (articlesRepository.findInGroup(source.translationGroupId, input.language)) {
    throw Boom.conflict(`A ${input.language} version of this article already exists`);
  }

  const translation = articlesRepository.create({
    projectId: source.projectId,
    slug: slugify(input.title),
    title: input.title,
    language: input.language,
    translationGroupId: source.translationGroupId,
    bodyMarkdown: input.bodyMarkdown,
    // A translation is the same work in another language, so it keeps the
    // licence the original was published under rather than asking again.
    licenseId: source.licenseId,
    createdBy: actor.id,
  });

  if (input.copyTail) {
    tailRepository.copyToArticle(source.id, translation.id);
  }

  return translation;
}

export function updateArticle(
  actor: User,
  id: number,
  input: { title: string; bodyMarkdown: string; status: ArticleStatus },
): Article {
  const article = getArticle(id);
  assertCanEditArticle(actor, article);
  return articlesRepository.update(id, input);
}

/**
 * Deletes one language version with its tail. Deleting the last version of a
 * translation group also deletes the group's library, which only that group's
 * articles could use. Other versions keep the shared library untouched.
 */
export function deleteArticle(actor: User, id: number): void {
  const article = getArticle(id);
  assertCanEditArticle(actor, article);

  const mediaPaths: string[] = [];
  db.transaction(() => {
    tailRepository.removeByArticle(id);
    projectsRepository.clearMainArticle(id);
    articlesRepository.remove(id);

    if (articlesRepository.listVersions(article.translationGroupId).length === 0) {
      for (const item of libraryRepository.listByGroup(article.translationGroupId)) {
        if (item.mediaUrl) mediaPaths.push(item.mediaUrl.replace(/^\/uploads\//, ''));
        libraryRepository.remove(item.id);
      }
      articlesRepository.removeGroup(article.translationGroupId);
    }
  })();

  // Disk cleanup runs after commit; a leftover file is harmless, a missing one is not.
  for (const diskPath of mediaPaths) {
    try {
      unlinkMedia(diskPath);
    } catch (err) {
      logger.warn(`Could not unlink ${diskPath} for deleted article ${id}`, err);
    }
  }
}
