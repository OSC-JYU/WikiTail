import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const dbPath = path.join(os.tmpdir(), `wikitail-library-${process.pid}.db`);
process.env.DB_PATH = dbPath;
const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wikitail-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

const { db } = await import('../../db/connection.js');
const { usersRepository } = await import('../users/repository.js');
const { libraryRepository } = await import('./repository.js');
const { updateLibraryItem, uploadToLibrary } = await import('./service.js');

const actor = usersRepository.upsertByEmail('tester@wikitail.local', 'author');

const png = () => Readable.from([Buffer.from('not really a png, but bytes are bytes')]);

function importedItem() {
  return libraryRepository.create({
    ownerId: actor.id,
    sourceType: 'commons',
    externalId: 'commons:File:Stone.jpg',
    externalUrl: 'https://commons.wikimedia.org/wiki/File:Stone.jpg',
    sourceRevision: null,
    language: null,
    conceptId: null,
    title: 'Stone.jpg',
    description: null,
    author: 'Tiia Monto',
    snapshotHtml: null,
    snapshotJson: null,
    localFileId: null,
    licenseName: 'CC BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    attributionText: null,
    importedBy: actor.id,
  });
}

beforeEach(() => {
  db.prepare('DELETE FROM library_items').run();
  db.prepare('DELETE FROM local_files').run();
});

afterAll(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('uploading your own file', () => {
  it('defaults to CC BY, because attribution is the point of sharing', async () => {
    const item = await uploadToLibrary(actor, {
      stream: png(),
      mimeType: 'image/png',
      filename: 'kivi.png',
    });
    expect(item.licenseName).toBe('CC BY 4.0');
    expect(item.licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
  });

  it('records the chosen licence, description and credit', async () => {
    const item = await uploadToLibrary(actor, {
      stream: png(),
      mimeType: 'image/png',
      filename: 'kivi.png',
      title: 'Ilokivi',
      description: 'Kivi talvella',
      author: 'Ari Häyrinen',
      licenceId: 'cc0-1.0',
    });
    expect(item.title).toBe('Ilokivi');
    expect(item.description).toBe('Kivi talvella');
    expect(item.author).toBe('Ari Häyrinen');
    expect(item.licenseName).toBe('CC0 1.0');
  });

  it('credits the uploader when no creator is named', async () => {
    const item = await uploadToLibrary(actor, {
      stream: png(),
      mimeType: 'image/png',
      filename: 'kivi.png',
    });
    expect(item.author).toBe(actor.displayName ?? actor.email);
  });

  it('refuses a licence it does not know', async () => {
    await expect(
      uploadToLibrary(actor, {
        stream: png(),
        mimeType: 'image/png',
        filename: 'k.png',
        licenceId: 'whatever-i-like',
      }),
    ).rejects.toThrow(/Unknown licence/);
  });
});

describe('editing a library item', () => {
  it('lets the owner caption an imported item', () => {
    const item = importedItem();
    const updated = updateLibraryItem(actor, item.id, { description: 'Matti istui tällä kivellä.' });
    expect(updated.description).toBe('Matti istui tällä kivellä.');
    // The source's own credit is untouched.
    expect(updated.author).toBe('Tiia Monto');
    expect(updated.licenseName).toBe('CC BY-SA 3.0');
  });

  // Relicensing or re-crediting someone else's work would be a licence violation
  // dressed up as an edit box.
  it('refuses to restate the licence or credit of imported work', () => {
    const item = importedItem();
    expect(() => updateLibraryItem(actor, item.id, { licenceId: 'cc0-1.0' })).toThrow(
      /keep the title, credit and licence of their source/,
    );
    expect(() => updateLibraryItem(actor, item.id, { author: 'Me, actually' })).toThrow(
      /keep the title, credit and licence of their source/,
    );
  });

  it('allows relicensing your own upload', async () => {
    const item = await uploadToLibrary(actor, {
      stream: png(),
      mimeType: 'image/png',
      filename: 'mine.png',
    });
    const updated = updateLibraryItem(actor, item.id, {
      licenceId: 'cc-by-sa-4.0',
      author: 'Ari Häyrinen',
    });
    expect(updated.licenseName).toBe('CC BY-SA 4.0');
    expect(updated.author).toBe('Ari Häyrinen');
  });
});
