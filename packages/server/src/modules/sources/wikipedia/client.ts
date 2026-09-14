import Boom from '@hapi/boom';
import { config } from '../../../config.js';

const actionApi = `https://${config.wikipediaLang}.wikipedia.org/w/api.php`;
const restApi = `https://api.wikimedia.org/core/v1/wikipedia/${config.wikipediaLang}`;

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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw Boom.badGateway(`Wikipedia API returned ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function searchArticles(query: string, limit: number): Promise<WikipediaSearchHit[]> {
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
    `${actionApi}?${params}`,
  );
  const pages = data.query?.pages ?? [];
  return [...pages].sort((a, b) => a.index - b.index);
}

/** The wiki's content license, fetched once and reused. */
let rightsInfo: Promise<{ url: string; text: string }> | undefined;

export function fetchRightsInfo(): Promise<{ url: string; text: string }> {
  rightsInfo ??= getJson<{ query: { rightsinfo: { url: string; text: string } } }>(
    `${actionApi}?action=query&format=json&formatversion=2&meta=siteinfo&siprop=rightsinfo`,
  ).then((data) => data.query.rightsinfo);
  return rightsInfo;
}

export async function fetchArticleHtml(
  title: string,
): Promise<{ html: string; revision: string | undefined }> {
  const res = await fetch(`${restApi}/page/${encodeURIComponent(title)}/html`, { headers });
  if (res.status === 404) {
    throw Boom.notFound(`Wikipedia article not found: ${title}`);
  }
  if (!res.ok) {
    throw Boom.badGateway(`Wikipedia REST API returned ${res.status} for ${title}`);
  }

  // ETag looks like: W/"1361616616/493d6ed3-.../view/html" — the leading number
  // is the revision this snapshot was taken from.
  const revision = res.headers.get('etag')?.match(/"(\d+)\//)?.[1];
  return { html: await res.text(), revision };
}

export function articleUrl(title: string): string {
  return `https://${config.wikipediaLang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}
