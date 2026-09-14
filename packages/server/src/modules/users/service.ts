import { config } from '../../config.js';
import { usersRepository } from './repository.js';
import type { User } from '@wikitail/shared';

/** Resolves (creating if needed) the local user record for an authenticated email. */
export function resolveIdentity(email: string): User {
  const normalized = email.trim().toLowerCase();
  const role = config.adminEmails.includes(normalized) ? 'admin' : 'author';
  return usersRepository.upsertByEmail(normalized, role);
}
