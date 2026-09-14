import Boom from '@hapi/boom';
import { config } from '../../../config.js';

const actionApi = (lang: string) => `https://${lang}.wikipedia.org/w/api.php`;
const restApi = (lang: string) => `https://api.wikimedia.org/core/v1/wikipedia/${lang}`;

// Wikimedia requires a descriptive User-Agent identifying the client.
const headers = {
  'User-Agent': config.wikipediaUserAgent,
  'Api-User-Agent': config.wikipediaUserAgent,
};

export interface WikipediaSearchHit {
  pageid: number;
  title: string;
  index: number;
  extract?: string;
  thumbnail?: { source: string };
}

export interface WikipediaConcept {
  /** Wikidata id, e.g. "Q185187". Absent for pages with no Wikidata item. */
  wikibaseItem?: string;
  /** Language code -> page title on that wiki. */
  langlinks: Record<string, string>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw Boom.badGateway(`Wikipedia API returned ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function searchArticles(
  query: string,
  limit: number,
  language: string,
): Promise<WikipediaSearchHit[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(limit),
    gsrnamespace: '0',
    prop: 'pageimages|extracts',
    exintro: '1',
    explaintext: '1',
    exsentences: '2',
    exlimit: 'max',
    piprop: 'thumbnail',
    pithumbsize: '200',
    pilimit: 'max',
  });

  const data = await getJson<{ query?: { pages?: WikipediaSearchHit[] } }>(
    `${actionApi(language)}?${params}`,
  );
  const pages = data.query?.pages ?? [];
  return [...pages].sort((a, b) => a.index - b.index);
}

/** The wiki's content licence, fetched once per language. */
const rightsInfoByLang = new Map<string, Promise<{ url: string; text: string }>>();

export function fetchRightsInfo(language: string): Promise<{ url: string; text: string }> {
  let pending = rightsInfoByLang.get(language);
  if (!pending) {
    pending = getJson<{ query: { rightsinfo: { url: string; text: string } } }>(
      `${actionApi(language)}?action=query&format=json&formatversion=2&meta=siteinfo&siprop=rightsinfo`,
    ).then((data) => data.query.rightsinfo);
    rightsInfoByLang.set(language, pending);
  }
  return pending;
}

/**
 * Wikidata id plus interlanguage links for a page — the key to matching the same
 * topic across wikis. One request covers both.
 */
export async function fetchConcept(title: string, language: string): Promise<WikipediaConcept> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    titles: title,
    prop: 'pageprops|langlinks',
    ppprop: 'wikibase_item',
    lllimit: 'max',
  });

  const data = await getJson<{
    query?: {
      pages?: {
        pageprops?: { wikibase_item?: string };
        langlinks?: { lang: string; title: string }[];
      }[];
    };
  }>(`${actionApi(language)}?${params}`);

  const page = data.query?.pages?.[0];
  return {
    wikibaseItem: page?.pageprops?.wikibase_item,
    langlinks: Object.fromEntries((page?.langlinks ?? []).map((l) => [l.lang, l.title])),
  };
}

export async function fetchArticleHtml(
  title: string,
  language: string,
): Promise<{ html: string; revision: string | undefined }> {
  const res = await fetch(`${restApi(language)}/page/${encodeURIComponent(title)}/html`, {
    headers,
  });
  if (res.status === 404) {
    throw Boom.notFound(`Wikipedia article not found: ${language}:${title}`);
  }
  if (!res.ok) {
    throw Boom.badGateway(`Wikipedia REST API returned ${res.status} for ${title}`);
  }

  // ETag looks like: W/"1361616616/493d6ed3-.../view/html" — the leading number
  // is the revision this snapshot was taken from.
  const revision = res.headers.get('etag')?.match(/"(\d+)\//)?.[1];
  return { html: await res.text(), revision };
}

export function articleUrl(title: string, language: string): string {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}
