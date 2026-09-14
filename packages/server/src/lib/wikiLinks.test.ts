import { describe, expect, it } from 'vitest';
import { framableWikiUrl, wikiPageTitle } from '../../../client/src/lib/wikiLinks.js';

/**
 * Only Wikimedia sites send neither X-Frame-Options nor frame-ancestors, so only
 * they render in a frame. Framing anything else shows the reader a blank box —
 * worse than the new tab it replaced — which is what these tests guard.
 */
describe('framableWikiUrl', () => {
  it('accepts Wikimedia sites', () => {
    expect(framableWikiUrl('https://fi.wikipedia.org/wiki/Ilokivi')).toBe(
      'https://fi.wikipedia.org/wiki/Ilokivi',
    );
    expect(framableWikiUrl('https://en.wiktionary.org/wiki/sauna')).toBe(
      'https://en.wiktionary.org/wiki/sauna',
    );
  });

  it('refuses everything else, which would not render', () => {
    for (const href of [
      'https://example.org/page',
      'https://finna.fi/Record/x',
      'https://commons.wikimedia.org/wiki/File:X.jpg',
      'https://notwikipedia.org/wiki/X',
      'https://wikipedia.org.evil.test/wiki/X',
    ]) {
      expect(framableWikiUrl(href)).toBeNull();
    }
  });

  it('refuses anything not served over https', () => {
    expect(framableWikiUrl('http://fi.wikipedia.org/wiki/X')).toBeNull();
    expect(framableWikiUrl('javascript:alert(1)')).toBeNull();
    expect(framableWikiUrl('not a url at all')).toBeNull();
  });

  // xx.m.wikipedia.org 301s to the main domain for every user agent now, so a
  // link to it is accepted but never manufactured.
  it('accepts the legacy mobile host without rewriting anything', () => {
    expect(framableWikiUrl('https://fi.m.wikipedia.org/wiki/Ilokivi')).toBe(
      'https://fi.m.wikipedia.org/wiki/Ilokivi',
    );
  });
});

describe('wikiPageTitle', () => {
  it('reads the article name out of the URL', () => {
    expect(wikiPageTitle('https://fi.wikipedia.org/wiki/Matti_Nyk%C3%A4nen')).toBe('Matti Nykänen');
  });
});
