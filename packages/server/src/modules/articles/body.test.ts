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
