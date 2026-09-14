import type { Server, ServerAuthSchemeObject } from '@hapi/hapi';
import { config } from '../../config.js';
import { resolveIdentity } from '../../modules/users/service.js';

/** Always authenticates as one fixed local user — no SSO/reverse-proxy required. */
export function devScheme(_server: Server): ServerAuthSchemeObject {
  return {
    authenticate(_request, h) {
      const user = resolveIdentity(config.devUserEmail);
      return h.authenticated({ credentials: user });
    },
  };
}
