import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dbPath = path.join(os.tmpdir(), `wikitail-users-${process.pid}.db`);
process.env.DB_PATH = dbPath;

const { db } = await import('../../db/connection.js');
const { usersRepository } = await import('./repository.js');
const { addUser, listUsers, setUserRole, updateMyDisplayName, userDisplayName } =
  await import('./service.js');

const admin = usersRepository.upsertByEmail('admin@wikitail.local', 'admin');
const author = usersRepository.upsertByEmail('author@wikitail.local', 'author');

afterAll(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
});

describe('adding people', () => {
  // Sign-in is the proxy's job; this only sets the role up front so it is right
  // the first time that address arrives.
  it('creates someone who has never signed in', () => {
    const added = addUser(admin, 'New.Person@Example.org', 'author');
    expect(added.email).toBe('new.person@example.org');
    expect(added.role).toBe('author');
    expect(listUsers(admin).some((u) => u.email === 'new.person@example.org')).toBe(true);
  });

  it('refuses a duplicate rather than silently resetting their role', () => {
    addUser(admin, 'dup@example.org', 'admin');
    expect(() => addUser(admin, 'dup@example.org', 'author')).toThrow(/already here/);
    expect(listUsers(admin).find((u) => u.email === 'dup@example.org')?.role).toBe('admin');
  });

  it('refuses something that is not an email address', () => {
    expect(() => addUser(admin, 'not an email', 'author')).toThrow(/does not look like/);
  });

  it('refuses a non-admin', () => {
    expect(() => addUser(author, 'x@example.org', 'author')).toThrow(/Only admins/);
  });
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

describe('display name', () => {
  it('defaults to the email up to the @', () => {
    expect(userDisplayName({ email: 'jane.doe@example.org', displayName: null })).toBe('jane.doe');
    expect(userDisplayName({ email: 'jane.doe@example.org', displayName: '  ' })).toBe('jane.doe');
  });

  it('uses the chosen name when set', () => {
    expect(userDisplayName({ email: 'jane@example.org', displayName: 'Jane Doe' })).toBe('Jane Doe');
  });

  it('lets a user change it, and clearing restores the default', () => {
    const renamed = updateMyDisplayName(author, '  Writer One ');
    expect(renamed.displayName).toBe('Writer One');
    expect(updateMyDisplayName(author, '   ').displayName).toBeNull();
  });
});
