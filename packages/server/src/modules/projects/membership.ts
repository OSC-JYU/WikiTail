import type { ProjectMemberRole, User } from '@wikitail/shared';
import { forbidden } from '../../lib/errors.js';
import { projectMembersRepository } from './members-repository.js';

/**
 * The three-layer authorization for project-scoped actions.
 *
 * - Global `admin` bypasses every check — they don't need a membership row.
 * - A `manager` of the project can edit content *and* change project settings
 *   (languages, snapshot mode, members).
 * - An `editor` of the project can create and edit articles, curate tails and
 *   upload library files, but cannot touch project settings or membership.
 * - Anyone else — including global `author`s who are not on the project —
 *   can only read published content.
 *
 * Draft articles are visible to admins and any member. This is the same gate as
 * `canEdit`: a viewer who can't edit anything in the project has no reason to
 * see its unpublished work either.
 */

export type EffectiveRole = 'admin' | ProjectMemberRole | null;

export function effectiveRole(actor: User, projectId: number): EffectiveRole {
  if (actor.role === 'admin') return 'admin';
  return projectMembersRepository.findRole(projectId, actor.id) ?? null;
}

export function canEdit(actor: User, projectId: number): boolean {
  return effectiveRole(actor, projectId) !== null;
}

export function canManage(actor: User, projectId: number): boolean {
  const role = effectiveRole(actor, projectId);
  return role === 'admin' || role === 'manager';
}

/** Drafts and other unpublished content share the same viewer set as editing. */
export const canViewDrafts = canEdit;

export function assertCanEdit(actor: User, projectId: number): void {
  if (!canEdit(actor, projectId)) {
    forbidden('You are not a member of this project');
  }
}

/**
 * Editing an existing article (and its tail and library) is limited to the user
 * who created it. Admins keep their global override; the owner must also still
 * be a member of the project.
 */
export function canEditArticle(
  actor: User,
  article: { projectId: number; createdBy: number },
): boolean {
  if (actor.role === 'admin') return true;
  return article.createdBy === actor.id && canEdit(actor, article.projectId);
}

export function assertCanEditArticle(
  actor: User,
  article: { projectId: number; createdBy: number },
): void {
  if (!canEditArticle(actor, article)) {
    forbidden('Only the owner of this article can edit it');
  }
}

export function assertCanManage(actor: User, projectId: number): void {
  if (!canManage(actor, projectId)) {
    forbidden('Only a project manager or an admin can change this');
  }
}
