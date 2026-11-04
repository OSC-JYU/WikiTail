import { describe, expect, it } from 'vitest';
import type { BrowseArticle } from '@wikitail/shared';
import { renderArticlePdf } from './article-pdf.js';

const data = {
  project: { title: 'Old Mills', description: null },
  article: {
    title: 'Vesimylly ääkköset',
    language: 'fi',
    licenseId: 'cc-by-4.0',
    updatedAt: '2026-10-01 10:00:00',
    bodyMarkdown: '# Heading\n\nText with [external](https://example.org) and [internal](/browse/x).\n\n[[library:42|Gone]]',
  },
  embeds: [],
  tail: [],
} as unknown as BrowseArticle;

describe('renderArticlePdf', () => {
  it('produces a PDF with a cover page and the article on following pages', async () => {
    const pdf = await renderArticlePdf(data, {
      email: 'reader@example.org',
      generatedAt: new Date('2026-11-04T06:50:00Z'),
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g);
    expect(pages).toHaveLength(2);
  });

  it('keeps links to external sources but drops links into Wikitail itself', async () => {
    const pdf = await renderArticlePdf(data, { email: 'a@b.c', generatedAt: new Date() });
    const text = pdf.toString('latin1');

    expect(text).toContain('https://example.org');
    expect(text).not.toContain('/browse/x');
  });
});
