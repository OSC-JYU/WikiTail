import path from 'node:path';
import sharp from 'sharp';
import type { LibraryItemSummary } from '@wikitail/shared';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';

/** A PDF page is never wider than this at print resolution; more pixels only bloat the file. */
const MAX_PIXEL_WIDTH = 1600;

/**
 * Reads a library image from disk as a JPEG the PDF writer can embed. Everything
 * is re-encoded because PDFKit only takes JPEG and PNG, while the library also
 * holds WebP, GIF, TIFF and (from Commons) SVG. Returns null for anything that is
 * not a local image, or that cannot be decoded — the caller then falls back to
 * the item's text credit.
 */
export async function loadImageForPdf(item: LibraryItemSummary): Promise<Buffer | null> {
  if (item.mediaKind !== 'image' || !item.mediaUrl) return null;

  const file = path.resolve(config.uploadsDir, item.mediaUrl.replace(/^\/uploads\//, ''));
  // The path comes from the database, but a bad row must not read outside uploads.
  if (!file.startsWith(config.uploadsDir + path.sep)) return null;

  try {
    return await sharp(file)
      .rotate()
      .resize({ width: MAX_PIXEL_WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (err) {
    logger.warn(`Could not prepare image for PDF (library item ${item.id})`, err);
    return null;
  }
}
