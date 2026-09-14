import Boom from '@hapi/boom';
import { config } from '../../config.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { usersRepository } from './repository.js';
import type { User, UserRole } from '@wikitail/shared';

/** Resolves (creating if needed) the local user record for an authenticated email. */
export function resolveIdentity(email: string): User {
  const normalized = email.trim().toLowerCase();
  const role = config.adminEmails.includes(normalized) ? 'admin' : 'author';
  return usersRepository.upsertByEmail(normalized, role);
}

/**
 * Adds someone before they have ever signed in. Sign-in itself is the proxy's
 * job — this only creates the local row, so their role is already right when the
 * `mail` header first arrives for that address.
 */
export function addUser(actor: User, email: string, role: UserRole): User {
  if (actor.role !== 'admin') forbidden('Only admins can add users');

  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw Boom.badRequest(`"${email}" does not look like an email address`);
  }
  if (usersRepository.findByEmail(normalized)) {
    throw Boom.conflict(`${normalized} is already here`);
  }

  return usersRepository.upsertByEmail(normalized, role);
}

export function listUsers(actor: User): User[] {
  if (actor.role !== 'admin') forbidden('Only admins can list users');
  return usersRepository.list();
}

/**
 * Roles are managed here rather than by the SSO proxy, which supplies identity
 * only. An admin cannot demote themselves: that is almost always a slip, and it
 * can leave an instance with nobody able to create projects.
 */
export function setUserRole(actor: User, userId: number, role: UserRole): User {
  if (actor.role !== 'admin') forbidden('Only admins can change roles');
  if (actor.id === userId && role !== 'admin') {
    throw Boom.badRequest('You cannot remove your own admin role');
  }

  const user = usersRepository.findById(userId);
  if (!user) notFound('User');

  return usersRepository.updateRole(userId, role);
}
