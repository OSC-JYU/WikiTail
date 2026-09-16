import Boom from '@hapi/boom';
import sanitizeHtml from 'sanitize-html';
import type { FinnaMediaKind, SourceSearchPage, SourceSnapshot } from '@wikitail/shared';
import { config } from '../../../config.js';
import type { SourceAdapter } from '../adapter.js';
import { downloadImage, fetchRecord, searchRecords, FINNA_SITE, type FinnaRecord } from './client.js';

function toExternalId(id: string): string {
  return `finna:${id}`;
}

function parseExternalId(externalId: string): string {
  const id = externalId.startsWith('finna:') ? externalId.slice('finna:'.length) : '';
  if (!id) {
    throw Boom.badRequest(`Malformed Finna id: ${externalId}`);
  }
  return id;
}

/**
 * Finna aggregates archives and museums, so its records carry every rights status
 * there is — CC0 through to "CNE", meaning nobody has evaluated the copyright.
 * Copying a file here means re-hosting it, so that only happens where the licence
 * plainly allows redistribution. Everything else is kept as a link to Finna,
 * which is always allowed.
 *
 * NoDerivatives is included: CC BY-ND permits redistributing a *verbatim* copy
 * for any purpose, and Finna's own rendering is stored unaltered. NonCommercial
 * defaults to allowed too — it still requires attribution and forbids
 * commercial use, which is exactly the situation a wiki project is normally
 * in — but a project run commercially can turn this off (`allowNonCommercial:
 * false`, from that project's setting).
 */
export function isReusable(copyright: string | undefined, allowNonCommercial = true): boolean {
  if (!copyright) return false;
  const code = copyright.toUpperCase().trim();

  if (code === 'PDM' || code.startsWith('CC0')) return true;
  if (!code.startsWith('CC BY')) return false;
  return allowNonCommercial || !code.includes('-NC');
}

/**
 * Finna's terms ask for the creator and the holding organisation, not just one
 * or the other — a museum's collection is part of the credit.
 */
export function buildCredit(record: FinnaRecord): { author?: string; attribution: string } {
  const creators = (record.nonPresenterAuthors ?? [])
    .filter((entry) => entry.name)
    .map((entry) => entry.name!.trim());
  const institution = record.institutions?.[0]?.translated ?? record.institutions?.[0]?.value;

  const author = [...new Set(creators)].join(', ') || undefined;
  const parts = [`"${record.title ?? record.id}"`];
  if (author) parts.push(`by ${author}`);
  if (institution) parts.push(`— ${institution}`);

  const licence = record.imageRights?.copyright;
  const suffix = licence ? `, ${licence}` : '';
  return { author, attribution: `${parts.join(' ')}${suffix}. Via Finna.` };
}

/** Summaries are third-party text, so they are stripped to plain words first. */
function summaryHtml(summary: string[] | undefined): string | undefined {
  if (!summary?.length) return undefined;
  const text = sanitizeHtml(summary.join(' '), { allowedTags: [], allowedAttributes: {} }).trim();
  return text ? `<p>${text}</p>` : undefined;
}

function recordUrl(record: FinnaRecord): string {
  return `${FINNA_SITE}${record.recordPage ?? `/Record/${record.id}`}`;
}

export const finnaAdapter: SourceAdapter = {
  key: 'finna',

  async search(query, opts): Promise<SourceSearchPage> {
    const { records, hasMore } = await searchRecords(
      query,
      opts?.limit ?? 10,
      opts?.language ?? config.defaultLanguage,
      (opts?.types as FinnaMediaKind[] | undefined) ?? ['image'],
      opts?.offset ?? 0,
    );

    return {
      results: records.map((record) => {
        const licence = record.imageRights?.copyright;
        const reusable = isReusable(licence, opts?.allowNonCommercial);
        // Finna returns a hierarchical list of format labels; the last entry is
        // the most specific one the reader would recognise ("Photograph", not
        // "Image").
        const format = record.formats?.[record.formats.length - 1]?.translated
          ?? record.formats?.[0]?.translated;
        return {
          sourceType: 'finna',
          externalId: toExternalId(record.id),
          title: [record.title, record.year].filter(Boolean).join(', ') || record.id,
          // The rights status decides whether importing copies the file or only
          // links to it, so it belongs in front of the author before they choose.
          snippet: licence
            ? `${licence}${reusable ? '' : ' — link only'}`
            : 'No licence stated — link only',
          thumbnailUrl: record.images?.[0] ? `${FINNA_SITE}${record.images[0]}` : undefined,
          ...(format ? { format } : {}),
        };
      }),
      hasMore,
    };
  },

  async importItem(externalId, opts) {
    const id = parseExternalId(externalId);
    const record = await fetchRecord(id, config.defaultLanguage);

    const licence = record.imageRights?.copyright;
    const { author, attribution } = buildCredit(record);
    const imagePath = record.images?.[0];

    // Restricted material is referenced, never copied: re-hosting a file whose
    // licence forbids it would not stop being wrong for being convenient.
    const mediaFile =
      imagePath && isReusable(licence, opts?.allowNonCommercial)
        ? await downloadImage(imagePath).then((file) => ({
            ...file,
            filename: `${record.title ?? id}.jpg`,
          }))
        : undefined;

    return {
      sourceType: 'finna',
      externalId,
      externalUrl: recordUrl(record),
      // Records describe objects rather than text, so there are no language versions.
      title: [record.title, record.year].filter(Boolean).join(', ') || id,
      html: summaryHtml(record.summary),
      licenseName: licence,
      licenseUrl: record.imageRights?.link,
      author,
      attributionText: attribution,
      ...(mediaFile ? { mediaFile } : {}),
    } satisfies SourceSnapshot;
  },
};
