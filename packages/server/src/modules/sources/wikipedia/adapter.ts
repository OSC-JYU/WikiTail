import Boom from '@hapi/boom';
import type { SourceSearchPage, SourceSnapshot } from '@wikitail/shared';
import { config } from '../../../config.js';
import type { SourceAdapter } from '../adapter.js';
import {
  articleUrl,
  fetchArticleHtml,
  fetchConcept,
  fetchRightsInfo,
  searchArticles,
} from './client.js';
import { sanitizeArticleHtml } from './sanitize.js';

/** External ids are "{lang}:{title}", e.g. "fi:Vesimylly". */
function toExternalId(language: string, title: string): string {
  return `${language}:${title}`;
}

function parseExternalId(externalId: string): { language: string; title: string } {
  const separator = externalId.indexOf(':');
  if (separator < 1 || separator === externalId.length - 1) {
    throw Boom.badRequest(`Malformed Wikipedia id: ${externalId}`);
  }
  return {
    language: externalId.slice(0, separator),
    title: externalId.slice(separator + 1),
  };
}

function toSiblingIds(langlinks: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(langlinks).map(([lang, title]) => [lang, toExternalId(lang, title)]),
  );
}

export const wikipediaAdapter: SourceAdapter = {
  key: 'wikipedia',

  async search(query, opts): Promise<SourceSearchPage> {
    const language = opts?.language ?? config.defaultLanguage;
    const { hits, hasMore } = await searchArticles(
      query,
      opts?.limit ?? 10,
      language,
      opts?.offset ?? 0,
    );
    return {
      results: hits.map((hit) => ({
        sourceType: 'wikipedia',
        externalId: toExternalId(language, hit.title),
        title: hit.title,
        snippet: hit.extract,
        thumbnailUrl: hit.thumbnail?.source,
        language,
      })),
      hasMore,
    };
  },

  async resolveSiblings(externalId) {
    const { language, title } = parseExternalId(externalId);
    const concept = await fetchConcept(title, language);
    return {
      conceptId: concept.wikibaseItem ? `wikidata:${concept.wikibaseItem}` : undefined,
      siblings: toSiblingIds(concept.langlinks),
    };
  },

  async importItem(externalId, opts) {
    const { language, title } = parseExternalId(externalId);
    const keepCopy = opts?.includeBody !== false;

    // With links only there is nothing to sanitize or store, so the 260KB fetch
    // is skipped entirely rather than fetched and thrown away.
    const [rights, concept, body] = await Promise.all([
      fetchRightsInfo(language),
      fetchConcept(title, language),
      keepCopy ? fetchArticleHtml(title, language) : undefined,
    ]);

    return {
      sourceType: 'wikipedia',
      externalId,
      externalUrl: articleUrl(title, language),
      sourceRevision: body?.revision,
      language,
      conceptId: concept.wikibaseItem ? `wikidata:${concept.wikibaseItem}` : undefined,
      siblings: toSiblingIds(concept.langlinks),
      title,
      html: body ? sanitizeArticleHtml(body.html, title, language) : undefined,
      licenseName: rights.text,
      licenseUrl: rights.url,
      author: 'Wikipedia contributors',
      attributionText: `"${title}" by Wikipedia contributors, licensed under ${rights.text}.`,
    } satisfies SourceSnapshot;
  },
};
