import Boom from '@hapi/boom';
import type { Project, SnapshotMode, User } from '@wikitail/shared';
import { config } from '../../config.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import { projectsRepository } from './repository.js';

export function listProjects(): Project[] {
  return projectsRepository.list();
}

export function getProjectBySlug(slug: string): Project {
  const project = projectsRepository.findBySlug(slug);
  if (!project) notFound('Project');
  return project;
}

export function createProject(
  actor: User,
  input: { title: string; description: string | null; languages?: string[] },
): Project {
  if (actor.role !== 'admin') {
    forbidden('Only admins can create projects');
  }
  const languages = normalizeLanguages(input.languages ?? [config.defaultLanguage]);
  return projectsRepository.create({
    slug: slugify(input.title),
    title: input.title,
    description: input.description,
    createdBy: actor.id,
    languages,
  });
}

/**
 * The project's language set is what authoring and import are constrained to, so
 * removing a language that articles already use would orphan them.
 */
export function setProjectLanguages(actor: User, slug: string, languages: string[]): Project {
  if (actor.role !== 'admin') {
    forbidden('Only admins can change project languages');
  }
  const project = getProjectBySlug(slug);
  const next = normalizeLanguages(languages);

  for (const removed of project.languages.filter((l) => !next.includes(l))) {
    const inUse = projectsRepository.countArticlesInLanguage(project.id, removed);
    if (inUse > 0) {
      throw Boom.conflict(
        `Cannot remove "${removed}": ${inUse} article(s) are written in it. Delete or translate them first.`,
      );
    }
  }

  return projectsRepository.setLanguages(project.id, next);
}

function normalizeLanguages(languages: string[]): string[] {
  const normalized = languages.map((l) => l.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) {
    throw Boom.badRequest('A project needs at least one language');
  }
  return [...new Set(normalized)];
}

/**
 * Hard copies keep an archive of what was cited; live links keep only enough to
 * point at it. Changing the setting affects future imports — existing copies are
 * left alone, since deleting an archive should be a deliberate act.
 */
export function setSnapshotMode(actor: User, slug: string, mode: SnapshotMode): Project {
  if (actor.role !== 'admin') {
    forbidden('Only admins can change how a project stores imports');
  }
  return projectsRepository.setSnapshotMode(getProjectBySlug(slug).id, mode);
}

export function assertLanguageAllowed(project: Project, language: string): void {
  if (!project.languages.includes(language)) {
    throw Boom.badRequest(
      `"${language}" is not one of this project's languages (${project.languages.join(', ')})`,
    );
  }
}
