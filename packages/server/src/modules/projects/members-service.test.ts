import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// Migrations run at import time — DB_PATH must be a throwaway file before any
// repository is imported.
const dbPath = path.join(os.tmpdir(), `wikitail-members-${process.pid}.db`);
process.env.DB_PATH = dbPath;

const { db } = await import('../../db/connection.js');
const { usersRepository } = await import('../users/repository.js');
const { projectsRepository } = await import('./repository.js');
const { projectMembersRepository } = await import('./members-repository.js');
const { batchAddMembers, listMembers, removeMember, updateMemberRole, ensureCreatorMembership } =
  await import('./members-service.js');
const { canEdit, canManage } = await import('./membership.js');

const admin = usersRepository.upsertByEmail('admin@wikitail.local', 'admin');
const otherAuthor = usersRepository.upsertByEmail('other@wikitail.local', 'author');

function makeProject() {
  const project = projectsRepository.create({
    slug: `p-${Math.random().toString(36).slice(2)}`,
    title: 'Test project',
    description: null,
    createdBy: admin.id,
    languages: ['fi'],
  });
  ensureCreatorMembership(admin.id, project.id);
  return project;
}

beforeEach(() => {
  // Delete in FK order — projects is pointed at from several tables.
  db.prepare('DELETE FROM project_members').run();
  db.prepare('DELETE FROM articles').run();
  db.prepare('DELETE FROM translation_groups').run();
  db.prepare('DELETE FROM project_languages').run();
  db.prepare('DELETE FROM projects').run();
  // Keep the two seeded users; drop anything the batch tests created.
  db.prepare("DELETE FROM users WHERE email NOT IN ('admin@wikitail.local', 'other@wikitail.local')").run();
});

afterAll(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
});

describe('batchAddMembers', () => {
  it('creates missing users and adds them at the requested role', () => {
    const project = makeProject();
    const result = batchAddMembers(
      admin,
      project.slug,
      ['new1@example.org', 'new2@example.org'],
      'editor',
    );

    expect(result.added).toHaveLength(2);
    expect(result.createdUsers).toEqual(['new1@example.org', 'new2@example.org']);
    expect(result.alreadyMembers).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.added.every((m) => m.role === 'editor')).toBe(true);
    // New users start as global `author`; their access comes from the membership row.
    expect(usersRepository.findByEmail('new1@example.org')?.role).toBe('author');
  });

  it('attaches an existing user without recreating them', () => {
    const project = makeProject();
    const result = batchAddMembers(admin, project.slug, ['other@wikitail.local'], 'manager');

    expect(result.added).toHaveLength(1);
    expect(result.createdUsers).toEqual([]);
    expect(result.added[0]!.userId).toBe(otherAuthor.id);
    expect(result.added[0]!.role).toBe('manager');
  });

  it('reports already-members without an error and never doubles up', () => {
    const project = makeProject();
    batchAddMembers(admin, project.slug, ['dup@example.org'], 'editor');
    const result = batchAddMembers(
      admin,
      project.slug,
      ['dup@example.org', 'fresh@example.org'],
      'editor',
    );

    expect(result.added.map((m) => m.email)).toEqual(['fresh@example.org']);
    expect(result.alreadyMembers).toEqual(['dup@example.org']);
    expect(listMembers(admin, project.slug).filter((m) => m.email === 'dup@example.org')).toHaveLength(1);
  });

  it('collects malformed addresses into `invalid` and processes the rest', () => {
    const project = makeProject();
    const result = batchAddMembers(
      admin,
      project.slug,
      ['ok@example.org', 'not an email', 'also-bad@'],
      'editor',
    );

    expect(result.added.map((m) => m.email)).toEqual(['ok@example.org']);
    expect(result.invalid).toEqual(['not an email', 'also-bad@']);
  });

  it('refuses non-managers', () => {
    const project = makeProject();
    // otherAuthor is not a member of this project at all.
    expect(() =>
      batchAddMembers(otherAuthor, project.slug, ['x@example.org'], 'editor'),
    ).toThrow(/manager|admin/);
  });

  it('lets project managers add members even without global admin', () => {
    const project = makeProject();
    // Promote otherAuthor to manager of this project.
    batchAddMembers(admin, project.slug, ['other@wikitail.local'], 'manager');

    const result = batchAddMembers(otherAuthor, project.slug, ['newbie@example.org'], 'editor');
    expect(result.added.map((m) => m.email)).toEqual(['newbie@example.org']);
  });
});

describe('membership authorization', () => {
  it('treats global admins as effective managers of every project', () => {
    const project = makeProject();
    expect(canEdit(admin, project.id)).toBe(true);
    expect(canManage(admin, project.id)).toBe(true);
  });

  it('editors can edit but not manage', () => {
    const project = makeProject();
    batchAddMembers(admin, project.slug, ['other@wikitail.local'], 'editor');
    expect(canEdit(otherAuthor, project.id)).toBe(true);
    expect(canManage(otherAuthor, project.id)).toBe(false);
  });

  it('non-members can do neither', () => {
    const project = makeProject();
    expect(canEdit(otherAuthor, project.id)).toBe(false);
    expect(canManage(otherAuthor, project.id)).toBe(false);
  });
});

describe('updateMemberRole', () => {
  it('promotes editors and demotes managers', () => {
    const project = makeProject();
    batchAddMembers(admin, project.slug, ['other@wikitail.local'], 'editor');
    const promoted = updateMemberRole(admin, project.slug, otherAuthor.id, 'manager');
    expect(promoted.role).toBe('manager');
  });

  it('refuses to demote the last manager', () => {
    const project = makeProject();
    // Creator (admin) is the sole manager.
    expect(() => updateMemberRole(admin, project.slug, admin.id, 'editor')).toThrow(
      /last manager/,
    );
  });

  it('lets a manager step down once someone else is a manager too', () => {
    const project = makeProject();
    batchAddMembers(admin, project.slug, ['other@wikitail.local'], 'manager');
    const demoted = updateMemberRole(admin, project.slug, admin.id, 'editor');
    expect(demoted.role).toBe('editor');
  });
});

describe('removeMember', () => {
  it('removes an editor', () => {
    const project = makeProject();
    batchAddMembers(admin, project.slug, ['other@wikitail.local'], 'editor');
    removeMember(admin, project.slug, otherAuthor.id);
    expect(projectMembersRepository.findRole(project.id, otherAuthor.id)).toBeUndefined();
  });

  it('refuses to remove the last manager', () => {
    const project = makeProject();
    expect(() => removeMember(admin, project.slug, admin.id)).toThrow(/last manager/);
  });
});
