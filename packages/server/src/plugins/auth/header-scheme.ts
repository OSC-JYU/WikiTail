import Boom from '@hapi/boom';
import type { Server, ServerAuthSchemeObject } from '@hapi/hapi';
import { resolveIdentity } from '../../modules/users/service.js';

/** Trusts a `mail` header injected by an upstream SSO reverse proxy for identity. */
export function headerScheme(_server: Server): ServerAuthSchemeObject {
  return {
    authenticate(request, h) {
      const mail = request.headers['mail'] as string | undefined;
      if (!mail) {
        throw Boom.unauthorized('Missing mail header');
      }
      const user = resolveIdentity(mail);
      return h.authenticated({ credentials: user });
    },
  };
}
