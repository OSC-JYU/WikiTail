import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dbPath = path.join(os.tmpdir(), `wikitail-users-${process.pid}.db`);
process.env.DB_PATH = dbPath;

const { db } = await import('../../db/connection.js');
const { usersRepository } = await import('./repository.js');
const { listUsers, setUserRole } = await import('./service.js');

const admin = usersRepository.upsertByEmail('admin@wikitail.local', 'admin');
const author = usersRepository.upsertByEmail('author@wikitail.local', 'author');

afterAll(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
});

describe('managing roles', () => {
  it('lets an admin promote an author', () => {
    const promoted = setUserRole(admin, author.id, 'admin');
    expect(promoted.role).toBe('admin');
    setUserRole(admin, author.id, 'author');
  });

  it('refuses to let an author change roles or list users', () => {
    expect(() => setUserRole(author, admin.id, 'author')).toThrow(/Only admins/);
    expect(() => listUsers(author)).toThrow(/Only admins/);
  });

  // Losing the last admin would leave nobody able to create projects, and it is
  // almost always a misclick rather than an intention.
  it('refuses to let an admin demote themselves', () => {
    expect(() => setUserRole(admin, admin.id, 'author')).toThrow(/your own admin role/);
    expect(usersRepository.findById(admin.id)?.role).toBe('admin');
  });

  it('reports an unknown user rather than silently doing nothing', () => {
    expect(() => setUserRole(admin, 9999, 'admin')).toThrow(/not found/);
  });
});
