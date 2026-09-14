import Boom from '@hapi/boom';
import sanitizeHtml from 'sanitize-html';
import type { SourceSearchResult, SourceSnapshot } from '@wikitail/shared';
import type { SourceAdapter } from '../adapter.js';
import { downloadMedia, fetchFileInfo, searchFiles, type CommonsImageInfo } from './client.js';

/** Commons ids look like "commons:File:Watermill 4.jpg". */
function toExternalId(title: string): string {
  return `commons:${title}`;
}

function parseExternalId(externalId: string): string {
  const title = externalId.startsWith('commons:') ? externalId.slice('commons:'.length) : '';
  if (!title) {
    throw Boom.badRequest(`Malformed Commons id: ${externalId}`);
  }
  return title;
}

/** extmetadata values arrive as HTML fragments, so they are never trusted as-is. */
export function toPlainText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim();
  return text || undefined;
}

function toRichText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const clean = sanitizeHtml(html, {
    allowedTags: ['p', 'a', 'i', 'b', 'em', 'strong', 'br', 'ul', 'ol', 'li'],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    transformTags: {
      a: (_tagName, attribs): { tagName: string; attribs: Record<string, string> } => {
        const raw = attribs.href ?? '';
        const href = raw.startsWith('//') ? `https:${raw}` : raw;
        if (!href.startsWith('http')) return { tagName: 'span', attribs: {} };
        return {
          tagName: 'a',
          attribs: { href, target: '_blank', rel: 'noopener noreferrer nofollow' },
        };
      },
    },
  }).trim();
  return clean || undefined;
}

function metadata(info: CommonsImageInfo, key: string): string | undefined {
  return info.extmetadata?.[key]?.value;
}

export function buildAttribution(title: string, artist?: string, license?: string): string {
  const name = title.replace(/^File:/, '');
  const by = artist ? ` by ${artist}` : '';
  const under = license ? `, licensed under ${license}` : '';
  return `"${name}"${by}${under}. Via Wikimedia Commons.`;
}

export const commonsAdapter: SourceAdapter = {
  key: 'commons',

  async search(query, opts) {
    const files = await searchFiles(query, opts?.limit ?? 10);
    return files.map(
      (file): SourceSearchResult => ({
        sourceType: 'commons',
        externalId: toExternalId(file.title),
        title: file.title.replace(/^File:/, ''),
        snippet: toPlainText(metadata(file.imageinfo?.[0] ?? {} as CommonsImageInfo, 'ImageDescription')),
        thumbnailUrl: file.imageinfo?.[0]?.thumburl,
      }),
    );
  },

  async importItem(externalId) {
    const title = parseExternalId(externalId);
    const info = await fetchFileInfo(title);

    // Prefer the scaled rendering: the original can be tens of megabytes, and a
    // page never needs that. The original remains linked as the source.
    const downloadUrl = info.thumburl ?? info.url;
    const { buffer, mimeType } = await downloadMedia(downloadUrl);

    const license = toPlainText(metadata(info, 'LicenseShortName'));
    const artist = toPlainText(metadata(info, 'Artist'));

    return {
      sourceType: 'commons',
      externalId,
      externalUrl: info.descriptionurl,
      // Commons files are language-neutral, so they have no sibling versions.
      title: title.replace(/^File:/, ''),
      html: toRichText(metadata(info, 'ImageDescription')),
      licenseName: license,
      licenseUrl: metadata(info, 'LicenseUrl'),
      author: artist,
      attributionText: buildAttribution(title, artist, license),
      mediaFile: {
        buffer,
        mimeType: info.thumbmime ?? mimeType,
        filename: title.replace(/^File:/, ''),
      },
    } satisfies SourceSnapshot;
  },
};
