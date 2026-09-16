import Boom from '@hapi/boom';
import type { Server, ServerAuthSchemeObject } from '@hapi/hapi';
import { resolveIdentity } from '../../modules/users/service.js';

/** Trusts a `mail` header injected by an upstream SSO reverse proxy for identity. */
export function headerScheme(_server: Server): ServerAuthSchemeObject {
  return {
    authenticate(request, h) {
      const mail = request.headers['mail'] as string | undefined;
      if (!mail) {
        // No header at all is a proxy configuration problem, not an
        // authorisation call — surface it as 401 so the operator can see it.
        throw Boom.unauthorized('Missing mail header');
      }
      const user = resolveIdentity(mail);
      if (!user) {
        // Authenticated by SSO, but not on the guest list. Ask an admin to
        // add them; the message is what the client shows.
        throw Boom.forbidden(
          'You are not authorised for Wikitail. Ask an administrator to add you.',
        );
      }
      return h.authenticated({ credentials: user });
    },
  };
}
