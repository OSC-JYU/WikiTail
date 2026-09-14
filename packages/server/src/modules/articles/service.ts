import type { Article, ArticleStatus, User } from '@wikitail/shared';
import { forbidden, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import { projectsRepository } from '../projects/repository.js';
import { articlesRepository } from './repository.js';

export function listArticlesForProject(projectId: number): Article[] {
  if (!projectsRepository.findById(projectId)) notFound('Project');
  return articlesRepository.listByProject(projectId);
}

export function getArticle(id: number): Article {
  const article = articlesRepository.findById(id);
  if (!article) notFound('Article');
  return article;
}

export function createArticle(
  actor: User,
  projectId: number,
  input: { title: string; bodyMarkdown: string },
): Article {
  if (!projectsRepository.findById(projectId)) notFound('Project');
  const slug = slugify(input.title);
  return articlesRepository.create({
    projectId,
    slug,
    title: input.title,
    bodyMarkdown: input.bodyMarkdown,
    createdBy: actor.id,
  });
}

export function updateArticle(
  actor: User,
  id: number,
  input: { title: string; bodyMarkdown: string; status: ArticleStatus },
): Article {
  const article = articlesRepository.findById(id);
  if (!article) notFound('Article');
  if (article.createdBy !== actor.id && actor.role !== 'admin') {
    forbidden('Only the author or an admin can edit this article');
  }
  return articlesRepository.update(id, input);
}
