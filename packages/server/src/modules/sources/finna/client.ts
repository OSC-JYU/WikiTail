import Boom from '@hapi/boom';
import type { FinnaMediaKind } from '@wikitail/shared';
import { config } from '../../../config.js';

const apiBase = 'https://api.finna.fi/v1';
export const FINNA_SITE = 'https://finna.fi';

/**
 * Finna's `format_ext_str_mv` is a hierarchical facet. `0/…/` is the top-level
 * bucket, and one bucket per media kind covers the search dimensions we care
 * about — anything more specific (photo vs. illustration, music vs. speech) is
 * a sub-facet the reader can narrow to on Finna itself.
 */
const FINNA_FORMAT: Record<FinnaMediaKind, string> = {
  image: '0/Image/',
  audio: '0/Sound/',
  video: '0/Video/',
  text: '0/Text/',
};

const headers = {
  'User-Agent': config.wikipediaUserAgent,
};

/** Fields worth asking for; Finna returns only what is requested. */
const FIELDS = [
  'id',
  'title',
  'images',
  'imageRights',
  'nonPresenterAuthors',
  'year',
  'formats',
  'summary',
  'institutions',
  'recordPage',
];

export interface FinnaRecord {
  id: string;
  title?: string;
  year?: string;
  images?: string[];
  imageRights?: { copyright?: string; link?: string; description?: string[] };
  nonPresenterAuthors?: { name?: string; role?: string }[];
  institutions?: { value?: string; translated?: string }[];
  formats?: { value?: string; translated?: string }[];
  summary?: string[];
  recordPage?: string;
}

interface FinnaResponse {
  status?: string;
  records?: FinnaRecord[];
  resultCount?: number;
}

async function getJson(url: string): Promise<FinnaResponse> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw Boom.badGateway(`Finna API returned ${res.status}`);
  }
  return (await res.json()) as FinnaResponse;
}

function withFields(params: URLSearchParams): URLSearchParams {
  for (const field of FIELDS) params.append('field[]', field);
  return params;
}

export async function searchRecords(
  query: string,
  limit: number,
  language: string,
  types: FinnaMediaKind[] = ['image'],
  offset = 0,
): Promise<{ records: FinnaRecord[]; hasMore: boolean }> {
  // Finna's VuFind backend paginates by `page`, 1-based. Callers speak in
  // offset, which is the natural language for a "Load more" pattern; convert
  // here. Non-multiple-of-limit offsets are rounded down to the nearest page —
  // in practice callers always pass `offset = results.length`, so this stays
  // aligned.
  const page = Math.floor(offset / limit) + 1;

  const params = withFields(
    new URLSearchParams({
      lookfor: query,
      type: 'AllFields',
      limit: String(limit),
      page: String(page),
      // Finna speaks fi, sv and en; anything else falls back to Finnish.
      lng: ['fi', 'sv', 'en'].includes(language) ? language : 'fi',
    }),
  );
  // free_online_boolean keeps records that actually have a file — plenty of Finna
  // records are catalogue entries with nothing attached. Neither this nor the
  // format filter implies a reuse licence; that is checked on import.
  params.append('filter[]', 'free_online_boolean:"1"');
  //
  // Media-kind filter. A `~`-prefixed filter on `format_ext_str_mv` is an OR
  // group in Finna's VuFind backend: repeat the prefix per kind and the search
  // returns records that match any one of them. Default is images-only so
  // callers that pass nothing get the original behaviour.
  //
  const kinds = types.length ? types : (['image'] as FinnaMediaKind[]);
  for (const kind of kinds) {
    params.append('filter[]', `~format_ext_str_mv:"${FINNA_FORMAT[kind]}"`);
  }

  const data = await getJson(`${apiBase}/search?${params}`);
  const records = data.records ?? [];
  // Finna reports the full match count as `resultCount`, so hasMore is exact
  // rather than "the last page happened to be full".
  const seen = offset + records.length;
  const hasMore =
    typeof data.resultCount === 'number' ? seen < data.resultCount : records.length === limit;
  return { records, hasMore };
}

export async function fetchRecord(id: string, language: string): Promise<FinnaRecord> {
  const params = withFields(
    new URLSearchParams({
      id,
      lng: ['fi', 'sv', 'en'].includes(language) ? language : 'fi',
    }),
  );

  const data = await getJson(`${apiBase}/record?${params}`);
  const record = data.records?.[0];
  if (!record) {
    throw Boom.notFound(`Finna record not found: ${id}`);
  }
  return record;
}

export async function downloadImage(path: string): Promise<{ buffer: Uint8Array; mimeType: string }> {
  const res = await fetch(`${FINNA_SITE}${path}`, { headers });
  if (!res.ok) {
    throw Boom.badGateway(`Could not download Finna image (${res.status})`);
  }

  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > config.maxImportBytes) {
    throw Boom.entityTooLarge('That file is over the import limit');
  }

  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > config.maxImportBytes) {
    throw Boom.entityTooLarge('That file is over the import limit');
  }

  return {
    buffer,
    mimeType: res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg',
  };
}
