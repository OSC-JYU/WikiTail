import Boom from '@hapi/boom';
import { config } from '../../../config.js';

const apiBase = 'https://api.finna.fi/v1';
export const FINNA_SITE = 'https://finna.fi';

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
): Promise<FinnaRecord[]> {
  const params = withFields(
    new URLSearchParams({
      lookfor: query,
      type: 'AllFields',
      limit: String(limit),
      // Finna speaks fi, sv and en; anything else falls back to Finnish.
      lng: ['fi', 'sv', 'en'].includes(language) ? language : 'fi',
    }),
  );
  // free_online_boolean keeps records that actually have a file — plenty of Finna
  // records are catalogue entries with nothing attached. The format filter keeps
  // it to pictures. Neither implies a reuse licence; that is checked on import.
  params.append('filter[]', 'free_online_boolean:"1"');
  params.append('filter[]', '~format_ext_str_mv:"0/Image/"');

  const data = await getJson(`${apiBase}/search?${params}`);
  return data.records ?? [];
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
