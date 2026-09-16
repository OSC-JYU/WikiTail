import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Isolate the DB and set ADMIN_EMAILS so this test's copy of `config` (a
// frozen module) matches what an operator would put in production.
const dbPath = path.join(os.tmpdir(), `wikitail-identity-${process.pid}.db`);
process.env.DB_PATH = dbPath;
process.env.ADMIN_EMAILS = 'ops@example.org, boss@example.org';

const { db } = await import('../../db/connection.js');
const { usersRepository } = await import('./repository.js');
const { resolveIdentity, resolveOrProvisionDevIdentity } = await import('./service.js');

afterAll(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
});

describe('resolveIdentity — the SSO gate', () => {
  // The core rule the operator asked for: an unknown email is not admitted.
  // The reverse proxy said "this is really them"; whether Wikitail lets them
  // in is a separate decision.
  it('rejects an email that has never been added', () => {
    expect(resolveIdentity('nobody@example.org')).toBeUndefined();
  });

  it('admits an email that an admin added ahead of time', () => {
    usersRepository.upsertByEmail('invited@example.org', 'author');
    const user = resolveIdentity('invited@example.org');
    expect(user?.email).toBe('invited@example.org');
    expect(user?.role).toBe('author');
  });

  it('is case- and whitespace-tolerant so the header value can be as sent', () => {
    usersRepository.upsertByEmail('mixed@example.org', 'author');
    expect(resolveIdentity('  Mixed@Example.ORG  ')?.email).toBe('mixed@example.org');
  });

  // ADMIN_EMAILS is the operator's escape hatch: fresh install with no users
  // yet, or admin access lost. That is what makes it worth having at all —
  // otherwise it would just duplicate the users table.
  it('auto-provisions a configured admin who has never signed in', () => {
    const user = resolveIdentity('ops@example.org');
    expect(user?.role).toBe('admin');
    // The row now exists in the users table for later sign-ins.
    expect(usersRepository.findByEmail('ops@example.org')?.role).toBe('admin');
  });

  it('promotes a configured admin who existed as an author', () => {
    usersRepository.upsertByEmail('boss@example.org', 'author');
    const user = resolveIdentity('boss@example.org');
    expect(user?.role).toBe('admin');
  });
});

describe('resolveOrProvisionDevIdentity — dev mode bypasses the gate', () => {
  it('provisions the fixed dev user without them being on the guest list', () => {
    const user = resolveOrProvisionDevIdentity('dev@wikitail.local');
    expect(user.email).toBe('dev@wikitail.local');
    // Not in ADMIN_EMAILS for this test, so falls back to author.
    expect(user.role).toBe('author');
  });
});
