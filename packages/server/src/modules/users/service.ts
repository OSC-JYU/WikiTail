import Boom from '@hapi/boom';
import { config } from '../../config.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { usersRepository } from './repository.js';
import type { User, UserRole } from '@wikitail/shared';

/**
 * Look up the local user record for an authenticated email.
 *
 * SSO tells us *who* someone is; whether Wikitail lets them in is separate.
 * An unknown email is not admitted — an admin has to add them first via
 * `POST /api/users`. The one exception is `ADMIN_EMAILS`: those addresses are
 * auto-provisioned (and kept) as admin, which is the ops handle for the first
 * sign-in on a fresh install and for restoring admin access if it is lost.
 *
 * Returns `undefined` for an unknown, non-configured email so the auth layer
 * can turn that into a 403 with a friendly message.
 */
export function resolveIdentity(email: string): User | undefined {
  const normalized = email.trim().toLowerCase();
  const isConfiguredAdmin = config.adminEmails.includes(normalized);

  const existing = usersRepository.findByEmail(normalized);
  if (existing) {
    // Honour ADMIN_EMAILS even after the row exists — otherwise a demotion or
    // a config change can lock admin access out with no way back short of
    // editing the database by hand.
    if (isConfiguredAdmin && existing.role !== 'admin') {
      return usersRepository.updateRole(existing.id, 'admin');
    }
    return existing;
  }

  if (isConfiguredAdmin) {
    return usersRepository.upsertByEmail(normalized, 'admin');
  }

  return undefined;
}

/**
 * Dev mode has no SSO in front, so the fixed local user is provisioned
 * unconditionally the first time it is seen. The header-mode gate never runs
 * here.
 */
export function resolveOrProvisionDevIdentity(email: string): User {
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

/** The name shown on documents: the chosen name, else the email up to the `@`. */
export function userDisplayName(user: Pick<User, 'email' | 'displayName'>): string {
  return user.displayName?.trim() || user.email.split('@')[0]!;
}

/** A blank name clears the choice, so the email-derived default applies again. */
export function updateMyDisplayName(actor: User, displayName: string): User {
  return usersRepository.updateDisplayName(actor.id, displayName.trim() || null);
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
