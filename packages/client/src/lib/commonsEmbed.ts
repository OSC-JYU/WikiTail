import type { LibraryItemSummary } from '@wikitail/shared';

/**
 * Builds a direct-playable URL for a Commons audio or video item that was
 * imported without a local file. In live-link projects Commons audio/video is
 * not downloaded, so `mediaUrl` is null and we have to reach the actual media
 * somehow.
 *
 * `Special:FilePath/<title>` is a stable public redirect that MediaWiki resolves
 * to the current upload URL on `upload.wikimedia.org`, sending the correct
 * media MIME type (e.g. `application/ogg`) — which is exactly what an HTML
 * `<audio>` or `<video>` element needs to play the file without an iframe. It
 * also always tracks the file's current version, unlike a URL we might cache.
 *
 * Returns null for anything that is not a Commons audio/video — images (which
 * have a `mediaUrl` and render via `<img>`), documents like PDFs, and
 * non-Commons sources.
 */
export interface CommonsEmbed {
  url: string;
  kind: 'audio' | 'video';
}

const VIDEO_EXTENSIONS = new Set(['ogv', 'webm', 'mp4']);
// .ogg on Commons is Vorbis audio by convention; Theora video uses .ogv.
const AUDIO_EXTENSIONS = new Set(['ogg', 'oga', 'opus', 'mp3', 'wav', 'flac', 'm4a']);

export function commonsEmbedFor(
  item: Pick<LibraryItemSummary, 'sourceType' | 'externalUrl' | 'mediaUrl' | 'title'>,
): CommonsEmbed | null {
  if (item.sourceType !== 'commons' || item.mediaUrl || !item.title) return null;

  const match = /\.([a-z0-9]+)$/i.exec(item.title);
  const ext = match?.[1]?.toLowerCase();
  if (!ext) return null;

  const kind: CommonsEmbed['kind'] | null = VIDEO_EXTENSIONS.has(ext)
    ? 'video'
    : AUDIO_EXTENSIONS.has(ext)
      ? 'audio'
      : null;
  if (!kind) return null;

  // MediaWiki treats spaces and underscores as equivalent in titles; spaces
  // stay readable in dev tools when we let the browser encode them.
  const filename = encodeURIComponent(item.title.replace(/ /g, '_'));
  return {
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${filename}`,
    kind,
  };
}
