import Boom from '@hapi/boom';
import type { SourceSearchResult, SourceSnapshot } from '@wikitail/shared';
import { config } from '../../../config.js';
import type { SourceAdapter } from '../adapter.js';
import { articleUrl, fetchArticleHtml, fetchRightsInfo, searchArticles } from './client.js';
import { sanitizeArticleHtml } from './sanitize.js';

/** External ids are namespaced by language so other wikis can coexist later. */
function toExternalId(title: string): string {
  return `${config.wikipediaLang}:${title}`;
}

function parseExternalId(externalId: string): string {
  const separator = externalId.indexOf(':');
  if (separator === -1) {
    throw Boom.badRequest(`Malformed Wikipedia id: ${externalId}`);
  }
  return externalId.slice(separator + 1);
}

export const wikipediaAdapter: SourceAdapter = {
  key: 'wikipedia',

  async search(query, opts) {
    const hits = await searchArticles(query, opts?.limit ?? 10);
    return hits.map(
      (hit): SourceSearchResult => ({
        sourceType: 'wikipedia',
        externalId: toExternalId(hit.title),
        title: hit.title,
        snippet: hit.extract,
        thumbnailUrl: hit.thumbnail?.source,
      }),
    );
  },

  async importItem(externalId) {
    const title = parseExternalId(externalId);
    const [{ html, revision }, rights] = await Promise.all([
      fetchArticleHtml(title),
      fetchRightsInfo(),
    ]);

    return {
      sourceType: 'wikipedia',
      externalId,
      externalUrl: articleUrl(title),
      sourceRevision: revision,
      title,
      html: sanitizeArticleHtml(html, title),
      licenseName: rights.text,
      licenseUrl: rights.url,
      attributionText: `"${title}" by Wikipedia contributors, licensed under ${rights.text}.`,
    } satisfies SourceSnapshot;
  },
};
