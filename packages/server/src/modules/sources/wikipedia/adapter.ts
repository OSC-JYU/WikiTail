import Boom from '@hapi/boom';
import type { SourceSearchResult, SourceSnapshot } from '@wikitail/shared';
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

  async search(query, opts) {
    const language = opts?.language ?? config.defaultLanguage;
    const hits = await searchArticles(query, opts?.limit ?? 10, language);
    return hits.map(
      (hit): SourceSearchResult => ({
        sourceType: 'wikipedia',
        externalId: toExternalId(language, hit.title),
        title: hit.title,
        snippet: hit.extract,
        thumbnailUrl: hit.thumbnail?.source,
        language,
      }),
    );
  },

  async resolveSiblings(externalId) {
    const { language, title } = parseExternalId(externalId);
    const concept = await fetchConcept(title, language);
    return {
      conceptId: concept.wikibaseItem ? `wikidata:${concept.wikibaseItem}` : undefined,
      siblings: toSiblingIds(concept.langlinks),
    };
  },

  async importItem(externalId) {
    const { language, title } = parseExternalId(externalId);
    const [{ html, revision }, rights, concept] = await Promise.all([
      fetchArticleHtml(title, language),
      fetchRightsInfo(language),
      fetchConcept(title, language),
    ]);

    return {
      sourceType: 'wikipedia',
      externalId,
      externalUrl: articleUrl(title, language),
      sourceRevision: revision,
      language,
      conceptId: concept.wikibaseItem ? `wikidata:${concept.wikibaseItem}` : undefined,
      siblings: toSiblingIds(concept.langlinks),
      title,
      html: sanitizeArticleHtml(html, title, language),
      licenseName: rights.text,
      licenseUrl: rights.url,
      attributionText: `"${title}" by Wikipedia contributors, licensed under ${rights.text}.`,
    } satisfies SourceSnapshot;
  },
};
