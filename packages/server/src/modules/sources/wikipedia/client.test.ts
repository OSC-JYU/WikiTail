import { describe, expect, it } from 'vitest';
import { toPathTitle } from './client.js';

describe('toPathTitle', () => {
  // A percent-encoded space is answered with 200 and a page of MediaWiki site
  // chrome rather than a 404, so this silently stored the wrong article until it
  // was caught by hand. Underscores are the only correct form.
  it('sends spaces as underscores', () => {
    expect(toPathTitle('Glacial erratic')).toBe('Glacial_erratic');
    expect(toPathTitle('Matti Nykänen')).toBe('Matti_Nyk%C3%A4nen');
  });

  it('never emits a percent-encoded space', () => {
    for (const title of ['Matti Nykänen', 'Glacial erratic', 'A B C D']) {
      expect(toPathTitle(title)).not.toContain('%20');
    }
  });

  it('percent-encodes non-ASCII characters', () => {
    expect(toPathTitle('Vesimylly')).toBe('Vesimylly');
    expect(toPathTitle('Café')).toBe('Caf%C3%A9');
  });

  it('escapes characters that would otherwise change the path', () => {
    expect(toPathTitle('Foo/Bar')).toBe('Foo%2FBar');
    expect(toPathTitle('100%')).toBe('100%25');
    expect(toPathTitle('A?b')).toBe('A%3Fb');
  });
});
