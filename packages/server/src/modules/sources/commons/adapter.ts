import Boom from '@hapi/boom';
import sanitizeHtml from 'sanitize-html';
import type { CommonsMediaKind, SourceSearchPage, SourceSnapshot } from '@wikitail/shared';
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

/**
 * Reads a media kind label off a mime type. Used to tag search results so a
 * mixed image+audio+video listing is legible — the thumbnail alone is not
 * enough to tell the two audio files from the two videos.
 */
export function mimeToKind(mimeType: string | undefined): string | undefined {
  if (!mimeType) return undefined;
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.startsWith('video/')) return 'Video';
  return undefined;
}

export const commonsAdapter: SourceAdapter = {
  key: 'commons',

  async search(query, opts): Promise<SourceSearchPage> {
    const { files, hasMore } = await searchFiles(
      query,
      opts?.limit ?? 10,
      (opts?.types as CommonsMediaKind[] | undefined) ?? ['image'],
      opts?.offset ?? 0,
    );
    return {
      results: files.map((file) => {
        const info = file.imageinfo?.[0];
        // Commons doesn't return a translated format label, but the mime type
        // is enough to say "audio" or "video" in the listing next to what's
        // otherwise a stack of thumbnails.
        const format = mimeToKind(info?.mime);
        return {
          sourceType: 'commons',
          externalId: toExternalId(file.title),
          title: file.title.replace(/^File:/, ''),
          snippet: toPlainText(metadata(info ?? ({} as CommonsImageInfo), 'ImageDescription')),
          thumbnailUrl: info?.thumburl,
          ...(format ? { format } : {}),
        };
      }),
      hasMore,
    };
  },

  async importItem(externalId, opts) {
    const title = parseExternalId(externalId);
    const info = await fetchFileInfo(title);

    const license = toPlainText(metadata(info, 'LicenseShortName'));
    const artist = toPlainText(metadata(info, 'Artist'));

    // Images are always pulled locally so the page renders instantly. Audio
    // and video only download when the project is in `hard_copy` mode; in
    // `live_link` mode they stay on Commons and the reader gets the Commons
    // embedded player. This mirrors the same choice Wikipedia already faces —
    // the project decides whether it hosts its own copy or links out.
    const mediaFile = await maybeDownload(info, title, opts?.includeBody ?? true);

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
      ...(mediaFile ? { mediaFile } : {}),
    } satisfies SourceSnapshot;
  },
};

async function maybeDownload(
  info: CommonsImageInfo,
  title: string,
  hardCopy: boolean,
): Promise<{ buffer: Uint8Array; mimeType: string; filename: string } | undefined> {
  const isImage = info.mime.startsWith('image/');
  const isPlayable = info.mime.startsWith('audio/') || info.mime.startsWith('video/');

  // Live-link mode: skip playable media; the client embeds the Commons player.
  // Other unrecognized kinds still download so their content is available.
  if (isPlayable && !hardCopy) return undefined;

  // Images use the scaled rendering — the original can be tens of megabytes and
  // a page never needs that. Playable media has no scaled rendering (thumburl
  // returns an image preview instead), so fetch the original for those.
  const downloadUrl = isImage ? (info.thumburl ?? info.url) : info.url;
  const { buffer, mimeType } = await downloadMedia(downloadUrl);
  return {
    buffer,
    mimeType: isImage ? (info.thumbmime ?? mimeType) : (info.mime ?? mimeType),
    filename: title.replace(/^File:/, ''),
  };
}
