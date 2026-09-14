import Boom from '@hapi/boom';
import type {
  Article,
  ArticleStatus,
  ArticleVersion,
  TranslationGroup,
  User,
} from '@wikitail/shared';
import { forbidden, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import { projectsRepository } from '../projects/repository.js';
import { assertLanguageAllowed } from '../projects/service.js';
import { tailRepository } from '../tail/repository.js';
import { articlesRepository } from './repository.js';

/** What to render when a translation group has no version in the requested language. */
export type ResolvedArticle =
  | { kind: 'match'; article: Article; versions: ArticleVersion[] }
  | { kind: 'substitute'; article: Article; requestedLanguage: string; versions: ArticleVersion[] }
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
 * Resolves a translation group for a reader in `language`, applying the author's
 * choice when that version does not exist: a substitute article if one was set,
 * otherwise nothing — the client shows the invitation to translate.
 */
export function resolveInLanguage(translationGroupId: number, language: string): ResolvedArticle {
  const group = articlesRepository.findGroup(translationGroupId);
  if (!group) notFound('Translation group');

  const versions = articlesRepository.listVersions(translationGroupId);
  const match = articlesRepository.findInGroup(translationGroupId, language);
  if (match) return { kind: 'match', article: match, versions };

  if (group.fallbackArticleId) {
    const substitute = articlesRepository.findById(group.fallbackArticleId);
    if (substitute) {
      return { kind: 'substitute', article: substitute, requestedLanguage: language, versions };
    }
  }

  return { kind: 'missing', requestedLanguage: language, versions };
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

export function setTranslationFallback(
  actor: User,
  translationGroupId: number,
  articleId: number | null,
): TranslationGroup {
  const group = articlesRepository.findGroup(translationGroupId);
  if (!group) notFound('Translation group');

  if (articleId !== null) {
    const article = getArticle(articleId);
    if (article.translationGroupId !== translationGroupId) {
      throw Boom.badRequest('The substitute must be a version of the same article');
    }
  }

  return articlesRepository.setFallback(translationGroupId, articleId);
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
