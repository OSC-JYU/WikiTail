import Boom from '@hapi/boom';
import type { CommonsMediaKind } from '@wikitail/shared';
import { config } from '../../../config.js';

const actionApi = 'https://commons.wikimedia.org/w/api.php';

/**
 * CirrusSearch `filetype:` values for each kind we surface. Images cover both
 * bitmap (JPG/PNG/GIF/…) and drawing (SVG); audio and video are single values.
 * The pipe-separated OR syntax works inside a single `filetype:` keyword.
 */
const COMMONS_FILETYPE: Record<CommonsMediaKind, string> = {
  image: 'bitmap|drawing',
  audio: 'audio',
  video: 'video',
};

const headers = {
  'User-Agent': config.wikipediaUserAgent,
  'Api-User-Agent': config.wikipediaUserAgent,
};

interface ExtMetadataValue {
  value?: string;
}

export interface CommonsImageInfo {
  /** The original file — large, and used as the "view source" target. */
  url: string;
  descriptionurl: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  /** A rendering scaled to the configured width; absent for non-image media. */
  thumburl?: string;
  thumbmime?: string;
  extmetadata?: Record<string, ExtMetadataValue>;
}

export interface CommonsFile {
  title: string;
  index?: number;
  imageinfo?: CommonsImageInfo[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw Boom.badGateway(`Commons API returned ${res.status}`);
  }
  return (await res.json()) as T;
}

function imageInfoParams(width: number): Record<string, string> {
  return {
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: String(width),
  };
}

export async function searchFiles(
  query: string,
  limit: number,
  types: CommonsMediaKind[] = ['image'],
  offset = 0,
): Promise<{ files: CommonsFile[]; hasMore: boolean }> {
  // CirrusSearch `filetype:` accepts pipe-OR within one keyword. Deduplicating
  // the OR terms keeps the URL tidy when the caller passes e.g. ['image'] on
  // its own (`bitmap|drawing`) versus everything (`bitmap|drawing|audio|video`).
  const kinds = types.length ? types : (['image'] as CommonsMediaKind[]);
  const terms = [...new Set(kinds.flatMap((k) => COMMONS_FILETYPE[k].split('|')))];
  const withFileType = terms.length
    ? `${query} filetype:${terms.join('|')}`
    : query;

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: withFileType,
    gsrlimit: String(limit),
    // Namespace 6 is File: — searching anything else returns pages, not media.
    gsrnamespace: '6',
    ...imageInfoParams(250),
  });
  // MediaWiki paginates on `gsroffset`; only send it for pages after the first.
  if (offset > 0) params.set('gsroffset', String(offset));

  // `continue.gsroffset` is the definitive "more available" signal — the page
  // size alone would misreport the last page when the last batch happens to
  // fill the limit exactly.
  const data = await getJson<{
    query?: { pages?: CommonsFile[] };
    continue?: { gsroffset?: number };
  }>(`${actionApi}?${params}`);
  return {
    files: [...(data.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)),
    hasMore: typeof data.continue?.gsroffset === 'number',
  };
}

export async function fetchFileInfo(title: string): Promise<CommonsImageInfo> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    titles: title,
    ...imageInfoParams(config.commonsImageWidth),
  });

  const data = await getJson<{ query?: { pages?: CommonsFile[] } }>(`${actionApi}?${params}`);
  const info = data.query?.pages?.[0]?.imageinfo?.[0];
  if (!info) {
    throw Boom.notFound(`Commons file not found: ${title}`);
  }
  return info;
}

/**
 * Downloads the media, refusing anything over the configured ceiling. The length
 * is checked twice: the declared Content-Length rejects an oversized file before
 * transferring it, and the received bytes are checked in case the header lied.
 */
export async function downloadMedia(
  url: string,
): Promise<{ buffer: Uint8Array; mimeType: string }> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw Boom.badGateway(`Could not download Commons media (${res.status})`);
  }

  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > config.maxImportBytes) {
    throw Boom.entityTooLarge(
      `That file is ${Math.round(declared / 1024 / 1024)}MB, over the ${Math.round(config.maxImportBytes / 1024 / 1024)}MB import limit`,
    );
  }

  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > config.maxImportBytes) {
    throw Boom.entityTooLarge('That file is over the import limit');
  }

  return {
    buffer,
    mimeType: res.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream',
  };
}
