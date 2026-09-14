import { describe, expect, it } from 'vitest';
import { sanitizeArticleHtml } from './sanitize.js';

const clean = (html: string, title = 'Test', language = 'en') =>
  sanitizeArticleHtml(html, title, language);

describe('sanitizeArticleHtml', () => {
  // Output is rendered with v-html, so anything executable getting through here
  // is an XSS hole in every page that shows an imported snapshot.
  describe('rejects active content', () => {
    const vectors: [string, string][] = [
      ['script tag', '<body><script>alert(1)</script><p>ok</p></body>'],
      ['img onerror', '<body><img src=x onerror="alert(1)"><p>ok</p></body>'],
      ['svg onload', '<body><svg onload="alert(1)"></svg><p>ok</p></body>'],
      ['javascript: href', '<body><a href="javascript:alert(1)">click</a></body>'],
      ['data: href', '<body><a href="data:text/html,<script>alert(1)</script>">x</a></body>'],
      ['iframe', '<body><iframe src="https://evil.test"></iframe></body>'],
      ['style block', '<body><style>body{background:url(https://evil.test/x)}</style><p>ok</p></body>'],
      ['inline style', '<body><div style="position:fixed;inset:0">x</div></body>'],
      ['form', '<body><form action="https://evil.test"><input name="p"></form></body>'],
      ['meta refresh', '<body><meta http-equiv="refresh" content="0;url=https://evil.test"></body>'],
      ['object and embed', '<body><object data="e.swf"></object><embed src="e.swf"></body>'],
      ['handlers on allowed tags', '<body><p onclick="alert(1)" onmouseover="alert(2)">ok</p></body>'],
      ['base tag', '<body><base href="https://evil.test/"></body>'],
    ];

    it.each(vectors)('%s', (_name, input) => {
      expect(clean(input)).not.toMatch(
        /<script|onerror|onload|onclick|onmouseover|javascript:|<iframe|<style|<form|<object|<embed|<base|http-equiv|position:fixed/i,
      );
    });

    it('discards head content rather than leaking it as text', () => {
      const out = clean('<html><head><title>SECRET</title></head><body><p>ok</p></body></html>');
      expect(out).not.toContain('SECRET');
      expect(out).toContain('<p>ok</p>');
    });
  });

  describe('resolves links against the snapshot language', () => {
    it('rewrites relative wiki links to that language wiki', () => {
      const fi = clean('<body><a href="./Vesimylly">x</a></body>', 'Mylly', 'fi');
      expect(fi).toContain('href="https://fi.wikipedia.org/wiki/Vesimylly"');
      expect(fi).not.toContain('en.wikipedia.org');
    });

    it('keeps languages separate', () => {
      const en = clean('<body><a href="./Watermill">x</a></body>', 'Watermill', 'en');
      expect(en).toContain('href="https://en.wikipedia.org/wiki/Watermill"');
    });

    it('points fragment-only anchors back at the source article', () => {
      const out = clean('<body><a href="#cite_note-1">1</a></body>', 'Old Mill', 'fi');
      expect(out).toContain('href="https://fi.wikipedia.org/wiki/Old_Mill#cite_note-1"');
    });

    it('upgrades protocol-relative image sources to https', () => {
      expect(clean('<body><img src="//upload.example/x.jpg"></body>')).toContain(
        'src="https://upload.example/x.jpg"',
      );
    });

    it('marks outbound links noopener and opens them in a new tab', () => {
      const out = clean('<body><a href="https://example.test">x</a></body>');
      expect(out).toContain('target="_blank"');
      expect(out).toContain('rel="noopener noreferrer nofollow"');
    });

    it('downgrades links it cannot resolve to plain text', () => {
      expect(clean('<body><a href="mailto:x@y.test">mail</a></body>')).toBe('<span>mail</span>');
    });
  });

  it('drops presentational attributes that carry no meaning without the wiki stylesheet', () => {
    const out = clean('<body><p class="mw-empty" id="mwAB" style="color:red">text</p></body>');
    expect(out).toBe('<p>text</p>');
  });

  it('keeps the structure that makes an article readable', () => {
    const out = clean(
      '<body><h2>Heading</h2><p>Body</p><ul><li>item</li></ul>' +
        '<figure><img src="https://x.test/a.png" alt="a"><figcaption>Caption</figcaption></figure>' +
        '<table><tr><th>H</th><td>D</td></tr></table></body>',
    );
    for (const fragment of ['<h2>Heading</h2>', '<p>Body</p>', '<li>item</li>', '<figcaption>Caption</figcaption>', '<th>H</th>']) {
      expect(out).toContain(fragment);
    }
    expect(out).toContain('alt="a"');
  });
});
