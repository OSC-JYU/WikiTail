import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'application/pdf': 'pdf',
};

export function kindFor(mimeType: string): LocalFileKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'other';
}

/**
 * Writes a file under the uploads root and returns its path relative to that
 * root — relative so the directory can move, and so the path can be appended to
 * /uploads to form a URL. The name is random: an uploader-supplied name could
 * collide or escape the directory.
 */
export function writeMedia(buffer: Uint8Array, mimeType: string): { diskPath: string } {
  const extension = EXTENSIONS[mimeType] ?? 'bin';
  // One level of fan-out keeps the directory listing manageable as this grows.
  const id = crypto.randomUUID();
  const relative = path.join(id.slice(0, 2), `${id}.${extension}`);
  const absolute = path.join(config.uploadsDir, relative);

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, buffer);

  return { diskPath: relative };
}

export function mediaUrl(diskPath: string): string {
  return `/uploads/${diskPath.split(path.sep).join('/')}`;
}
