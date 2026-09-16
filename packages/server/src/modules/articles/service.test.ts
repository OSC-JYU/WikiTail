import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// Repositories prepare statements against the database at import time, so the
// path has to be set before anything is imported. Migrations then build the
// schema in this throwaway file — the tests run against real SQLite rather than
// a mock, so constraint and SQL mistakes surface here too.
const dbPath = path.join(os.tmpdir(), `wikitail-articles-${process.pid}.db`);
process.env.DB_PATH = dbPath;

const { db } = await import('../../db/connection.js');
const { usersRepository } = await import('../users/repository.js');
const { projectsRepository } = await import('../projects/repository.js');
const { articlesRepository } = await import('./repository.js');
const { createArticle, createTranslation, resolveInLanguage } = await import('./service.js');

const actor = usersRepository.upsertByEmail('tester@wikitail.local', 'admin');

function makeProject(languages: string[]) {
  return projectsRepository.create({
    slug: `p-${Math.random().toString(36).slice(2)}`,
    title: 'Test project',
    description: null,
    createdBy: actor.id,
    languages,
  });
}

beforeEach(() => {
  db.prepare('DELETE FROM articles').run();
  db.prepare('DELETE FROM translation_groups').run();
});

afterAll(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
});

describe('article languages', () => {
  it('defaults to the project primary language', () => {
    const project = makeProject(['fi', 'en']);
    const article = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    expect(article.language).toBe('fi');
  });

  it('refuses a language the project has not declared', () => {
    const project = makeProject(['fi', 'en']);
    expect(() =>
      createArticle(actor, project.id, { title: 'Mühle', bodyMarkdown: '', language: 'de' }),
    ).toThrow(/not one of this project's languages/);
  });

  it('lets the same slug exist in different languages', () => {
    const project = makeProject(['fi', 'sv']);
    const fi = createArticle(actor, project.id, {
      title: 'Sauna',
      bodyMarkdown: '',
      language: 'fi',
    });
    const sv = createArticle(actor, project.id, {
      title: 'Sauna',
      bodyMarkdown: '',
      language: 'sv',
    });
    expect(fi.slug).toBe('sauna');
    expect(sv.slug).toBe('sauna');
    expect(fi.translationGroupId).not.toBe(sv.translationGroupId);
  });
});

describe('article licence', () => {
  it('defaults to CC BY', () => {
    const project = makeProject(['fi']);
    const article = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    expect(article.licenseId).toBe('cc-by-4.0');
  });

  it('accepts an explicit choice from the same list uploads use', () => {
    const project = makeProject(['fi']);
    const article = createArticle(actor, project.id, {
      title: 'Mylly',
      bodyMarkdown: '',
      licenseId: 'cc0-1.0',
    });
    expect(article.licenseId).toBe('cc0-1.0');
  });

  it('refuses an unknown licence id', () => {
    const project = makeProject(['fi']);
    expect(() =>
      createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '', licenseId: 'bogus' }),
    ).toThrow(/Unknown licence/);
  });

  it('translations keep the source article licence', () => {
    const project = makeProject(['fi', 'en']);
    const fi = createArticle(actor, project.id, {
      title: 'Mylly',
      bodyMarkdown: '',
      licenseId: 'cc-by-sa-4.0',
    });
    const en = createTranslation(actor, fi.id, { language: 'en', title: 'Mill', bodyMarkdown: '' });
    expect(en.licenseId).toBe('cc-by-sa-4.0');
  });
});

describe('translations', () => {
  it('joins the source article translation group', () => {
    const project = makeProject(['fi', 'en']);
    const fi = createArticle(actor, project.id, { title: 'Vanha vesimylly', bodyMarkdown: '' });
    const en = createTranslation(actor, fi.id, {
      language: 'en',
      title: 'The Old Watermill',
      bodyMarkdown: '',
    });

    expect(en.translationGroupId).toBe(fi.translationGroupId);
    expect(articlesRepository.listVersions(fi.translationGroupId).map((v) => v.language)).toEqual([
      'en',
      'fi',
    ]);
  });

  it('refuses a second version in the same language', () => {
    const project = makeProject(['fi', 'en']);
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    createTranslation(actor, fi.id, { language: 'en', title: 'Mill', bodyMarkdown: '' });

    expect(() =>
      createTranslation(actor, fi.id, { language: 'en', title: 'Mill again', bodyMarkdown: '' }),
    ).toThrow(/already exists/);
  });

  it('refuses a translation in a language the project dropped', () => {
    const project = makeProject(['fi']);
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    expect(() =>
      createTranslation(actor, fi.id, { language: 'en', title: 'Mill', bodyMarkdown: '' }),
    ).toThrow(/not one of this project's languages/);
  });
});

describe('resolving a group for a reader', () => {
  it('returns the matching version when it exists', () => {
    const project = makeProject(['fi', 'en']);
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });

    const resolved = resolveInLanguage(actor, fi.translationGroupId, 'fi');
    expect(resolved.kind).toBe('match');
    expect(resolved.kind === 'match' && resolved.article.id).toBe(fi.id);
  });

  it('reports a language with no version as missing', () => {
    const project = makeProject(['fi', 'en']);
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });

    const resolved = resolveInLanguage(actor, fi.translationGroupId, 'en');
    expect(resolved.kind).toBe('missing');
    expect(resolved.versions.map((v) => v.language)).toEqual(['fi']);
  });

  it('resolves to the translation once one is written', () => {
    const project = makeProject(['fi', 'en']);
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    expect(resolveInLanguage(actor, fi.translationGroupId, 'en').kind).toBe('missing');

    const en = createTranslation(actor, fi.id, { language: 'en', title: 'Mill', bodyMarkdown: '' });

    const resolved = resolveInLanguage(actor, fi.translationGroupId, 'en');
    expect(resolved.kind).toBe('match');
    expect(resolved.kind === 'match' && resolved.article.id).toBe(en.id);
  });
});
