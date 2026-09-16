import Boom from '@hapi/boom';
import type { MyProject, Project, SnapshotMode, User } from '@wikitail/shared';
import { config } from '../../config.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import { ensureCreatorMembership } from './members-service.js';
import { assertCanManage } from './membership.js';
import { projectsRepository } from './repository.js';

export function listProjects(): Project[] {
  return projectsRepository.list();
}

/**
 * Projects the current user can act on. Admins see everything (tagged `admin`),
 * everyone else sees their memberships tagged with their role. This is what the
 * welcome page uses — a user should land on a list they actually belong to,
 * not on every project on the site.
 */
export function listMyProjects(actor: User): MyProject[] {
  if (actor.role === 'admin') {
    return projectsRepository.list().map((p) => ({ ...p, myRole: 'admin' }));
  }
  return projectsRepository.listForUser(actor.id);
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
  const project = projectsRepository.create({
    slug: slugify(input.title),
    title: input.title,
    description: input.description,
    createdBy: actor.id,
    languages,
  });
  // Admins bypass membership checks, but recording them as a manager means
  // demoting the admin later doesn't accidentally lock them out of their own
  // project.
  ensureCreatorMembership(actor.id, project.id);
  return project;
}

/**
 * The project's language set is what authoring and import are constrained to, so
 * removing a language that articles already use would orphan them.
 */
export function setProjectLanguages(actor: User, slug: string, languages: string[]): Project {
  const project = getProjectBySlug(slug);
  assertCanManage(actor, project.id);
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
  const project = getProjectBySlug(slug);
  assertCanManage(actor, project.id);
  return projectsRepository.setSnapshotMode(project.id, mode);
}

/**
 * NC material is otherwise reusable — attribution and non-commercial use are
 * the only conditions — so this defaults to allowed. Turned off only for
 * projects whose operator knows their deployment is commercial.
 */
export function setFinnaAllowNonCommercial(actor: User, slug: string, allow: boolean): Project {
  const project = getProjectBySlug(slug);
  assertCanManage(actor, project.id);
  return projectsRepository.setFinnaAllowNonCommercial(project.id, allow);
}

export function assertLanguageAllowed(project: Project, language: string): void {
  if (!project.languages.includes(language)) {
    throw Boom.badRequest(
      `"${language}" is not one of this project's languages (${project.languages.join(', ')})`,
    );
  }
}
