import { libraryShortcode, referencedLibraryIds } from '@wikitail/shared';
import type { BrowseArticle, BrowseListing, LibraryItem, Project } from '@wikitail/shared';
import { db } from '../../db/connection.js';
import { notFound } from '../../lib/errors.js';
import { articlesRepository } from '../articles/repository.js';
import { libraryRepository } from '../library/repository.js';
import { projectsRepository } from '../projects/repository.js';
import { listTail } from '../tail/service.js';

const publishedGroupsStmt = db.prepare(`
  SELECT DISTINCT translation_group_id AS id
  FROM articles WHERE project_id = ? AND status = 'published'
`);

// An item is public if some published article shows it — either in its tail or
// embedded in its body.
const publicItemStmt = db.prepare(`
  SELECT
    (SELECT count(*) FROM tail_entries
       JOIN articles ON articles.id = tail_entries.article_id
       WHERE tail_entries.library_item_id = :id AND articles.status = 'published')
    +
    (SELECT count(*) FROM articles
       WHERE status = 'published' AND body_markdown LIKE :shortcode)
    AS count
`);

export function listProjects(): Project[] {
  return projectsRepository.list();
}

export function getProject(slug: string): Project {
  const project = projectsRepository.findBySlug(slug);
  if (!project) notFound('Project');
  return project;
}

/**
 * Published content for a project, one entry per translation group, in the
 * reader's language. Groups with no version in that language still appear,
 * carrying the languages they do exist in, so a missing translation is visible
 * rather than hidden.
 */
export function listProjectContent(slug: string, language: string): BrowseListing[] {
  const project = getProject(slug);

  return (publishedGroupsStmt.all(project.id) as { id: number }[]).map(({ id }) => {
    const published = articlesRepository
      .listVersions(id)
      .filter((version) => version.status === 'published');

    const match = published.find((version) => version.language === language);

    return {
      translationGroupId: id,
      article: match ? articlesRepository.findById(match.id)! : null,
      availableLanguages: published.map((v) => v.language),
    };
  });
}

/**
 * Slugs are unique per (project, language), not per project — the Finnish and
 * English versions of "Ilokivi" share a slug — so the public URL has to carry the
 * language to identify a version.
 */
export function getArticle(
  projectSlug: string,
  language: string,
  articleSlug: string,
): BrowseArticle {
  const project = getProject(projectSlug);
  const article = articlesRepository.findBySlug(project.id, language, articleSlug);
  if (!article || article.status !== 'published') notFound('Article');

  return {
    project,
    article,
    tail: listTail(article.id),
    embeds: resolveEmbeds(article.bodyMarkdown, article.language),
    versions: articlesRepository
      .listVersions(article.translationGroupId)
      .filter((version) => version.status === 'published'),
    requestedLanguage: null,
  };
}

/** Items the body embeds, swapped for the article-language version where one exists. */
function resolveEmbeds(bodyMarkdown: string, language: string) {
  return referencedLibraryIds(bodyMarkdown).flatMap((id) => {
    const stored = libraryRepository.findSummaryById(id);
    if (!stored) return [];
    if (!stored.conceptId || stored.language === language) return [stored];
    return [
      libraryRepository.findByConcept(stored.translationGroupId, stored.conceptId, language) ??
        stored,
    ];
  });
}

/**
 * A snapshot is public only while some published article's tail points at it —
 * the library itself stays private.
 */
export function getLibraryItem(id: number): LibraryItem {
  const { count } = publicItemStmt.get({
    id,
    shortcode: `%${libraryShortcode(id)}%`,
  }) as { count: number };
  if (count === 0) notFound('Library item');

  const item = libraryRepository.findById(id);
  if (!item) notFound('Library item');
  return item;
}
