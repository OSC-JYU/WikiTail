import Hapi from '@hapi/hapi';
import { describe, expect, it } from 'vitest';
import { csrfPlugin } from './csrf.js';

/** A minimal server that just echoes the method so we can see whether a
 *  request reached the handler or was rejected by the CSRF gate. */
async function makeServer() {
  const server = Hapi.server({ port: 0 });
  await server.register(csrfPlugin);
  server.route({
    method: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    path: '/x',
    options: { auth: false },
    handler: () => 'ok',
  });
  return server;
}

describe('CSRF gate (Sec-Fetch-Site)', () => {
  it('lets safe methods through regardless of Sec-Fetch-Site', async () => {
    const server = await makeServer();
    const res = await server.inject({
      method: 'GET',
      url: '/x',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts a same-origin state-changing request (the SPA to itself)', async () => {
    const server = await makeServer();
    const res = await server.inject({
      method: 'POST',
      url: '/x',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a cross-site state-changing request', async () => {
    const server = await makeServer();
    const res = await server.inject({
      method: 'POST',
      url: '/x',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a same-site request too (sibling subdomains are not us)', async () => {
    const server = await makeServer();
    const res = await server.inject({
      method: 'PATCH',
      url: '/x',
      headers: { 'sec-fetch-site': 'same-site' },
    });
    expect(res.statusCode).toBe(403);
  });

  // Non-browser callers (curl, native mobile apps, server-to-server) send no
  // fetch metadata at all — we do not want to lock them out.
  it('allows a request with no Sec-Fetch-Site header (non-browser caller)', async () => {
    const server = await makeServer();
    const res = await server.inject({ method: 'POST', url: '/x' });
    expect(res.statusCode).toBe(200);
  });
});
