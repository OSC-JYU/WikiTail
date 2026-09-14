import { describe, expect, it } from 'vitest';
import { libraryShortcode, referencedLibraryIds, splitArticleBody } from '@wikitail/shared';

describe('splitArticleBody', () => {
  it('returns a single run when there are no embeds', () => {
    expect(splitArticleBody('# Title\n\nSome text')).toEqual([
      { type: 'text', text: '# Title\n\nSome text' },
    ]);
  });

  it('splits text around an embed', () => {
    expect(splitArticleBody('before\n\n[[library:12]]\n\nafter')).toEqual([
      { type: 'text', text: 'before\n\n' },
      { type: 'library', libraryItemId: 12 },
      { type: 'text', text: '\n\nafter' },
    ]);
  });

  it('handles consecutive embeds without inventing empty runs', () => {
    expect(splitArticleBody('[[library:1]][[library:2]]')).toEqual([
      { type: 'library', libraryItemId: 1 },
      { type: 'library', libraryItemId: 2 },
    ]);
  });

  it('drops whitespace-only runs', () => {
    expect(splitArticleBody('   \n [[library:3]]  \n ')).toEqual([
      { type: 'library', libraryItemId: 3 },
    ]);
  });

  it('ignores malformed shortcodes, leaving them as text', () => {
    const body = '[[library:]] [[library:abc]] [[ library:4 ]]';
    expect(splitArticleBody(body)).toEqual([{ type: 'text', text: body }]);
  });

  it('returns nothing for an empty body', () => {
    expect(splitArticleBody('')).toEqual([]);
    expect(splitArticleBody('   ')).toEqual([]);
  });
});

describe('referencedLibraryIds', () => {
  it('lists ids in order of first appearance, without duplicates', () => {
    expect(referencedLibraryIds('[[library:5]] x [[library:2]] y [[library:5]]')).toEqual([5, 2]);
  });

  it('round-trips with libraryShortcode', () => {
    expect(referencedLibraryIds(`text ${libraryShortcode(42)}`)).toEqual([42]);
  });
});

describe('readable labels', () => {
  // The label exists so a body still says what it meant if the library row is
  // lost; the id is what actually resolves.
  it('carries the label alongside the id', () => {
    expect(splitArticleBody('[[library:12|fi:Vesimylly]]')).toEqual([
      { type: 'library', libraryItemId: 12, label: 'fi:Vesimylly' },
    ]);
  });

  it('still accepts a bare id, so existing bodies keep working', () => {
    expect(splitArticleBody('[[library:12]]')).toEqual([{ type: 'library', libraryItemId: 12 }]);
  });

  it('resolves by id even when the label is wrong or stale', () => {
    expect(referencedLibraryIds('[[library:12|something else entirely]]')).toEqual([12]);
  });

  it('builds a shortcode with and without a label', () => {
    expect(libraryShortcode(12, 'commons:File:Stone.jpg')).toBe(
      '[[library:12|commons:File:Stone.jpg]]',
    );
    expect(libraryShortcode(12)).toBe('[[library:12]]');
    expect(libraryShortcode(12, '   ')).toBe('[[library:12]]');
  });

  it('strips characters from a label that would break the shortcode', () => {
    expect(libraryShortcode(12, 'a|b]c')).toBe('[[library:12|abc]]');
  });
});
