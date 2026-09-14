import Boom from '@hapi/boom';
import { config } from '../../../config.js';

const actionApi = 'https://commons.wikimedia.org/w/api.php';

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

export async function searchFiles(query: string, limit: number): Promise<CommonsFile[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(limit),
    // Namespace 6 is File: — searching anything else returns pages, not media.
    gsrnamespace: '6',
    ...imageInfoParams(250),
  });

  const data = await getJson<{ query?: { pages?: CommonsFile[] } }>(`${actionApi}?${params}`);
  return [...(data.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
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
