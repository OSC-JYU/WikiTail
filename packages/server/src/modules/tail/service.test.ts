import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const dbPath = path.join(os.tmpdir(), `wikitail-tail-${process.pid}.db`);
process.env.DB_PATH = dbPath;

const { db } = await import('../../db/connection.js');
const { usersRepository } = await import('../users/repository.js');
const { projectsRepository } = await import('../projects/repository.js');
const { libraryRepository } = await import('../library/repository.js');
const { createArticle, createTranslation } = await import('../articles/service.js');
const { addToTail, listTail, removeTailEntry, reorderTail, updateTailEntry } = await import(
  './service.js'
);

const actor = usersRepository.upsertByEmail('tester@wikitail.local', 'admin');
const other = usersRepository.upsertByEmail('other@wikitail.local', 'author');

function makeProject() {
  return projectsRepository.create({
    slug: `p-${Math.random().toString(36).slice(2)}`,
    title: 'Test project',
    description: null,
    createdBy: actor.id,
    languages: ['fi', 'en'],
  });
}

function makeItem(opts: {
  language: string;
  conceptId: string | null;
  title: string;
  ownerId?: number;
}) {
  return libraryRepository.create({
    ownerId: opts.ownerId ?? actor.id,
    sourceType: 'wikipedia',
    externalId: `${opts.language}:${opts.title}`,
    externalUrl: `https://${opts.language}.wikipedia.org/wiki/${opts.title}`,
    sourceRevision: null,
    language: opts.language,
    conceptId: opts.conceptId,
    title: opts.title,
    snapshotHtml: '<p>snapshot</p>',
    snapshotJson: null,
    licenseName: 'CC BY-SA 4.0',
    licenseUrl: 'https://example.test/licence',
    attributionText: 'Wikipedia contributors',
    importedBy: opts.ownerId ?? actor.id,
  });
}

beforeEach(() => {
  db.prepare('DELETE FROM tail_entries').run();
  db.prepare('DELETE FROM articles').run();
  db.prepare('DELETE FROM translation_groups').run();
  db.prepare('DELETE FROM library_items').run();
});

afterAll(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
});

describe('curating a tail', () => {
  it('appends entries in order and keeps the author commentary', () => {
    const project = makeProject();
    const article = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const a = makeItem({ language: 'fi', conceptId: null, title: 'Vesimylly' });
    const b = makeItem({ language: 'fi', conceptId: null, title: 'Myllykivi' });

    addToTail(actor, article.id, { libraryItemId: a.id, commentary: 'Vanha keksintö' });
    addToTail(actor, article.id, { libraryItemId: b.id, commentary: null });

    const tail = listTail(article.id);
    expect(tail.map((e) => e.position)).toEqual([0, 1]);
    expect(tail[0].commentary).toBe('Vanha keksintö');
    expect(tail[0].item.title).toBe('Vesimylly');
  });

  it('allows the same item more than once, each with its own commentary', () => {
    const project = makeProject();
    const article = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const item = makeItem({ language: 'fi', conceptId: null, title: 'Vesimylly' });

    addToTail(actor, article.id, { libraryItemId: item.id, commentary: 'First point' });
    addToTail(actor, article.id, { libraryItemId: item.id, commentary: 'Second point' });

    expect(listTail(article.id).map((e) => e.commentary)).toEqual([
      'First point',
      'Second point',
    ]);
  });

  it('reorders, edits and removes entries', () => {
    const project = makeProject();
    const article = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const a = makeItem({ language: 'fi', conceptId: null, title: 'A' });
    const b = makeItem({ language: 'fi', conceptId: null, title: 'B' });

    const first = addToTail(actor, article.id, { libraryItemId: a.id, commentary: null });
    const second = addToTail(actor, article.id, { libraryItemId: b.id, commentary: null });

    reorderTail(actor, article.id, [second.id, first.id]);
    expect(listTail(article.id).map((e) => e.item.title)).toEqual(['B', 'A']);

    updateTailEntry(actor, first.id, 'now with a note');
    expect(listTail(article.id).find((e) => e.id === first.id)?.commentary).toBe(
      'now with a note',
    );

    removeTailEntry(actor, second.id);
    expect(listTail(article.id).map((e) => e.item.title)).toEqual(['A']);
  });

  it('rejects a reorder that does not list exactly this tail', () => {
    const project = makeProject();
    const article = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const item = makeItem({ language: 'fi', conceptId: null, title: 'A' });
    const entry = addToTail(actor, article.id, { libraryItemId: item.id, commentary: null });

    expect(() => reorderTail(actor, article.id, [entry.id, 9999])).toThrow(/exactly the entries/);
  });

  it('refuses to attach another user library item', () => {
    const project = makeProject();
    const article = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const theirs = makeItem({
      language: 'fi',
      conceptId: null,
      title: 'Theirs',
      ownerId: other.id,
    });

    expect(() =>
      addToTail(actor, article.id, { libraryItemId: theirs.id, commentary: null }),
    ).toThrow(/another user/);
  });
});

describe('copying a tail onto a translation', () => {
  it('starts empty unless the author asks for a copy', () => {
    const project = makeProject();
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const item = makeItem({ language: 'fi', conceptId: null, title: 'Vesimylly' });
    addToTail(actor, fi.id, { libraryItemId: item.id, commentary: 'note' });

    const en = createTranslation(actor, fi.id, { language: 'en', title: 'Mill', bodyMarkdown: '' });
    expect(listTail(en.id)).toHaveLength(0);
  });

  it('carries entries, commentary and order across as a draft', () => {
    const project = makeProject();
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const a = makeItem({ language: 'fi', conceptId: null, title: 'A' });
    const b = makeItem({ language: 'fi', conceptId: null, title: 'B' });
    addToTail(actor, fi.id, { libraryItemId: a.id, commentary: 'eka' });
    addToTail(actor, fi.id, { libraryItemId: b.id, commentary: 'toka' });

    const en = createTranslation(actor, fi.id, {
      language: 'en',
      title: 'Mill',
      bodyMarkdown: '',
      copyTail: true,
    });

    const copied = listTail(en.id);
    expect(copied.map((e) => e.item.title)).toEqual(['A', 'B']);
    expect(copied.map((e) => e.commentary)).toEqual(['eka', 'toka']);
  });

  it('leaves the source tail untouched', () => {
    const project = makeProject();
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const item = makeItem({ language: 'fi', conceptId: null, title: 'A' });
    addToTail(actor, fi.id, { libraryItemId: item.id, commentary: 'note' });

    const en = createTranslation(actor, fi.id, {
      language: 'en',
      title: 'Mill',
      bodyMarkdown: '',
      copyTail: true,
    });
    removeTailEntry(actor, listTail(en.id)[0].id);

    expect(listTail(fi.id)).toHaveLength(1);
  });

  it('shows copied entries in the translation language where a version exists', () => {
    const project = makeProject();
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const concept = 'wikidata:Q185187';
    const fiItem = makeItem({ language: 'fi', conceptId: concept, title: 'Vesimylly' });
    makeItem({ language: 'en', conceptId: concept, title: 'Watermill' });
    addToTail(actor, fi.id, { libraryItemId: fiItem.id, commentary: 'vanha keksintö' });

    const en = createTranslation(actor, fi.id, {
      language: 'en',
      title: 'Mill',
      bodyMarkdown: '',
      copyTail: true,
    });

    const [entry] = listTail(en.id);
    // The item follows the article's language; only the note still needs translating.
    expect(entry.item.title).toBe('Watermill');
    expect(entry.shownInOtherLanguage).toBe(false);
    expect(entry.commentary).toBe('vanha keksintö');
  });
});

describe('resolving tail items to the article language', () => {
  it('swaps in the version matching the article language', () => {
    const project = makeProject();
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const en = createTranslation(actor, fi.id, { language: 'en', title: 'Mill', bodyMarkdown: '' });

    const concept = 'wikidata:Q185187';
    const fiItem = makeItem({ language: 'fi', conceptId: concept, title: 'Vesimylly' });
    makeItem({ language: 'en', conceptId: concept, title: 'Watermill' });

    // Added while writing Finnish, but the English article should show English.
    addToTail(actor, fi.id, { libraryItemId: fiItem.id, commentary: 'note' });
    db.prepare('INSERT INTO tail_entries (article_id, library_item_id, commentary, position) VALUES (?,?,?,0)')
      .run(en.id, fiItem.id, 'note');

    const [onFinnish] = listTail(fi.id);
    expect(onFinnish.item.title).toBe('Vesimylly');
    expect(onFinnish.shownInOtherLanguage).toBe(false);

    const [onEnglish] = listTail(en.id);
    expect(onEnglish.item.title).toBe('Watermill');
    expect(onEnglish.shownInOtherLanguage).toBe(false);
  });

  it('keeps the stored item and flags it when no version exists in that language', () => {
    const project = makeProject();
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const en = createTranslation(actor, fi.id, { language: 'en', title: 'Mill', bodyMarkdown: '' });

    const fiOnly = makeItem({ language: 'fi', conceptId: 'wikidata:Q999', title: 'Paikallinen' });
    db.prepare('INSERT INTO tail_entries (article_id, library_item_id, commentary, position) VALUES (?,?,?,0)')
      .run(en.id, fiOnly.id, null);

    const [entry] = listTail(en.id);
    expect(entry.item.title).toBe('Paikallinen');
    expect(entry.shownInOtherLanguage).toBe(true);
  });

  it('leaves items with no concept alone', () => {
    const project = makeProject();
    const fi = createArticle(actor, project.id, { title: 'Mylly', bodyMarkdown: '' });
    const item = makeItem({ language: 'fi', conceptId: null, title: 'Kuva' });
    addToTail(actor, fi.id, { libraryItemId: item.id, commentary: null });

    expect(listTail(fi.id)[0].item.title).toBe('Kuva');
  });
});
