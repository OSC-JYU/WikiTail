import type { Server, ServerAuthSchemeObject } from '@hapi/hapi';
import { config } from '../../config.js';
import { resolveOrProvisionDevIdentity } from '../../modules/users/service.js';

/** Always authenticates as one fixed local user — no SSO/reverse-proxy required. */
export function devScheme(_server: Server): ServerAuthSchemeObject {
  return {
    authenticate(_request, h) {
      // Dev mode bypasses the guest-list check that header mode enforces: the
      // whole point of dev mode is to run without any setup.
      const user = resolveOrProvisionDevIdentity(config.devUserEmail);
      return h.authenticated({ credentials: user });
    },
  };
}
