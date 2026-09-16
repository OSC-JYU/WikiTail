import Boom from '@hapi/boom';
import type {
  BatchAddMembersResult,
  ProjectMember,
  ProjectMemberRole,
  User,
} from '@wikitail/shared';
import { notFound } from '../../lib/errors.js';
import { usersRepository } from '../users/repository.js';
import { projectMembersRepository } from './members-repository.js';
import { assertCanEdit, assertCanManage } from './membership.js';
import { projectsRepository } from './repository.js';

function requireProject(slug: string) {
  const project = projectsRepository.findBySlug(slug);
  if (!project) notFound('Project');
  return project;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Members list is scoped to the project — you must be able to edit it (or be admin) to see who else can. */
export function listMembers(actor: User, slug: string): ProjectMember[] {
  const project = requireProject(slug);
  assertCanEdit(actor, project.id);
  return projectMembersRepository.listByProject(project.id);
}

/**
 * Splits a paste of emails into buckets and attaches everyone at once. Missing
 * users are provisioned as global `author`s so their SSO sign-in will succeed —
 * this is the one place, other than `POST /api/users`, that pre-creates a user
 * before they've ever hit the site.
 *
 * The batch never partially fails: anything valid goes through, anything odd is
 * reported so the manager can fix and retry. That is what makes this useful for
 * pasting a course roster.
 */
export function batchAddMembers(
  actor: User,
  slug: string,
  emails: string[],
  role: ProjectMemberRole,
): BatchAddMembersResult {
  const project = requireProject(slug);
  assertCanManage(actor, project.id);

  const result: BatchAddMembersResult = {
    added: [],
    createdUsers: [],
    alreadyMembers: [],
    invalid: [],
  };
  const seen = new Set<string>();

  for (const raw of emails) {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (!EMAIL_RE.test(normalized)) {
      result.invalid.push(raw);
      continue;
    }

    let user = usersRepository.findByEmail(normalized);
    if (!user) {
      // New users start as global `author`. Their per-project role is what
      // grants access; the global role only decides whether they can create
      // projects (they can't) and admin the site (they can't).
      user = usersRepository.upsertByEmail(normalized, 'author');
      result.createdUsers.push(normalized);
    }

    if (projectMembersRepository.findRole(project.id, user.id)) {
      result.alreadyMembers.push(normalized);
      continue;
    }

    result.added.push(projectMembersRepository.add(project.id, user.id, role));
  }

  return result;
}

/**
 * The last manager on a project cannot be demoted or removed by themselves,
 * for the same reason admins cannot self-demote: a project with no manager has
 * no route back to being manageable except through a global admin.
 */
export function updateMemberRole(
  actor: User,
  slug: string,
  userId: number,
  role: ProjectMemberRole,
): ProjectMember {
  const project = requireProject(slug);
  assertCanManage(actor, project.id);

  const current = projectMembersRepository.findRole(project.id, userId);
  if (!current) notFound('Member');
  if (current === role) return projectMembersRepository.findOne(project.id, userId)!;

  if (current === 'manager' && role !== 'manager') {
    assertNotLastManager(project.id, userId);
  }

  return projectMembersRepository.updateRole(project.id, userId, role);
}

export function removeMember(actor: User, slug: string, userId: number): void {
  const project = requireProject(slug);
  assertCanManage(actor, project.id);

  const current = projectMembersRepository.findRole(project.id, userId);
  if (!current) notFound('Member');

  if (current === 'manager') {
    assertNotLastManager(project.id, userId);
  }

  // Prevent a manager from removing themselves and then finding they've lost
  // access to their own project. Global admins can still remove anyone.
  if (actor.id === userId && actor.role !== 'admin' && !hasOtherAdminOrManager(project.id, userId)) {
    throw Boom.badRequest('You cannot remove yourself as the last manager of this project');
  }

  projectMembersRepository.remove(project.id, userId);
}

function assertNotLastManager(projectId: number, userId: number) {
  if (
    projectMembersRepository.findRole(projectId, userId) === 'manager' &&
    projectMembersRepository.countManagers(projectId) <= 1
  ) {
    throw Boom.badRequest(
      'This is the last manager of the project. Promote someone else first.',
    );
  }
}

function hasOtherAdminOrManager(projectId: number, excludeUserId: number): boolean {
  // Global admins always count as effective managers — they bypass membership.
  // If none exist besides the departing user, we still need another manager row.
  return projectMembersRepository
    .listByProject(projectId)
    .some((m) => m.role === 'manager' && m.userId !== excludeUserId);
}

/**
 * Called when a project is created so the creator immediately has a way in.
 * Admins are creators today, so this row is redundant while they stay admins,
 * but if they're demoted later they keep the project.
 */
export function ensureCreatorMembership(userId: number, projectId: number): void {
  if (!projectMembersRepository.findRole(projectId, userId)) {
    projectMembersRepository.add(projectId, userId, 'manager');
  }
}
