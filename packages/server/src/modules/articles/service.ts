import Boom from '@hapi/boom';
import type { Article, ArticleStatus, ArticleVersion, User } from '@wikitail/shared';
import { forbidden, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
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

export function listArticlesForProject(projectId: number, language?: string): Article[] {
  requireProject(projectId);
  const articles = articlesRepository.listByProject(projectId);
  return language ? articles.filter((a) => a.language === language) : articles;
}

export function getArticle(id: number): Article {
  const article = articlesRepository.findById(id);
  if (!article) notFound('Article');
  return article;
}

export function listVersions(translationGroupId: number): ArticleVersion[] {
  return articlesRepository.listVersions(translationGroupId);
}

/**
 * Resolves a translation group for a reader in `language`. A missing version is
 * reported as missing rather than quietly replaced by another language — writing
 * the translation is the author's job, and the reader is told plainly.
 */
export function resolveInLanguage(translationGroupId: number, language: string): ResolvedArticle {
  if (!articlesRepository.findGroup(translationGroupId)) notFound('Translation group');

  const versions = articlesRepository.listVersions(translationGroupId);
  const match = articlesRepository.findInGroup(translationGroupId, language);

  return match
    ? { kind: 'match', article: match, versions }
    : { kind: 'missing', requestedLanguage: language, versions };
}

export function createArticle(
  actor: User,
  projectId: number,
  input: { title: string; bodyMarkdown: string; language?: string },
): Article {
  const project = requireProject(projectId);
  const language = input.language ?? project.languages[0];
  assertLanguageAllowed(project, language);

  return articlesRepository.create({
    projectId,
    slug: slugify(input.title),
    title: input.title,
    language,
    bodyMarkdown: input.bodyMarkdown,
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
  if (article.createdBy !== actor.id && actor.role !== 'admin') {
    forbidden('Only the author or an admin can edit this article');
  }
  return articlesRepository.update(id, input);
}
