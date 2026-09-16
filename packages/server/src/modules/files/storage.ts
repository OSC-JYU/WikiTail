import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { LocalFileKind } from '@wikitail/shared';
import { config } from '../../config.js';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  // Some browsers/OSes report WAV as the legacy, non-standard 'audio/x-wav'
  // instead of the registered 'audio/wav' — accepted as the same extension.
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  // .ogx is Ogg's generic container — used when a file mixes codecs (e.g.
  // Vorbis audio + Theora video) so neither audio/ogg nor video/ogg fits.
  'application/ogg': 'ogx',
  'application/pdf': 'pdf',
};

/**
 * What may be uploaded. Deliberately narrow: these files are served from the
 * app's own origin, and SVG is excluded because it can carry script — Commons
 * may still bring one in, which is why the uploads route is sandboxed too.
 */
const UPLOADABLE = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'application/ogg',
  'application/pdf',
]);

export function isUploadable(mimeType: string): boolean {
  return UPLOADABLE.has(mimeType);
}

export function uploadableTypes(): string[] {
  return [...UPLOADABLE];
}

export function kindFor(mimeType: string): LocalFileKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  // .ogx has no audio/video prefix to go on — its container can hold either.
  // Treated as video so it gets a player with visual controls rather than the
  // audio-only bar, since an Ogg file mixing codecs usually has a video track.
  if (mimeType === 'application/ogg') return 'video';
  return 'other';
}

/**
 * Writes a file under the uploads root and returns its path relative to that
 * root — relative so the directory can move, and so the path can be appended to
 * /uploads to form a URL. The name is random: an uploader-supplied name could
 * collide or escape the directory.
 */
function targetFor(mimeType: string): { relative: string; absolute: string } {
  const extension = EXTENSIONS[mimeType] ?? 'bin';
  // One level of fan-out keeps the directory listing manageable as this grows.
  const id = crypto.randomUUID();
  const relative = path.join(id.slice(0, 2), `${id}.${extension}`);
  const absolute = path.join(config.uploadsDir, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return { relative, absolute };
}

export function writeMedia(buffer: Uint8Array, mimeType: string): { diskPath: string } {
  const { relative, absolute } = targetFor(mimeType);
  fs.writeFileSync(absolute, buffer);
  return { diskPath: relative };
}

/**
 * Streams an upload to disk rather than buffering it — a video can be hundreds
 * of megabytes, and holding that in memory to write it out again is pointless.
 * A failed write leaves no stray file behind.
 */
export async function writeMediaStream(
  stream: Readable,
  mimeType: string,
): Promise<{ diskPath: string; byteSize: number }> {
  const { relative, absolute } = targetFor(mimeType);
  let byteSize = 0;
  stream.on('data', (chunk: Buffer) => {
    byteSize += chunk.length;
  });

  try {
    await pipeline(stream, fs.createWriteStream(absolute));
  } catch (err) {
    fs.rmSync(absolute, { force: true });
    throw err;
  }

  return { diskPath: relative, byteSize };
}

export function mediaUrl(diskPath: string): string {
  return `/uploads/${diskPath.split(path.sep).join('/')}`;
}

/**
 * Removes a file previously written by `writeMedia` / `writeMediaStream`.
 * Missing files are ignored so a partially-deleted item can still finish its
 * cleanup — the point is to leave nothing orphaned on disk, not to catch a
 * race someone else already handled.
 */
export function unlinkMedia(diskPath: string): void {
  fs.rmSync(path.join(config.uploadsDir, diskPath), { force: true });
}
