import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
import path from 'node:path';
import { findLicence, splitArticleBody } from '@wikitail/shared';
import type { BrowseArticle, LibraryItemSummary } from '@wikitail/shared';
import { labelsFor, type PdfLabels } from './labels.js';
import { loadImageForPdf } from './images.js';
import {
  COLORS,
  FONTS,
  ensureSpace,
  isExternalUrl,
  renderMarkdownToPdf,
  writeRuns,
  type BlockContext,
  type Run,
} from './markdown-pdf.js';

const ACCENT = '#1f3a5f';
const MARGIN = 56;
const FOOTER_RESERVE = 64;
const BODY_SIZE = 10.5;
const MAX_IMAGE_HEIGHT = 330;

const fontDir = path.join(
  path.dirname(createRequire(import.meta.url).resolve('dejavu-fonts-ttf/package.json')),
  'ttf',
);

export interface PdfExportOptions {
  /** Email of the signed-in user the document is generated for. */
  email: string;
  generatedAt: Date;
}

function formatDateTime(date: Date, language: string): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  };
  let text: string;
  try {
    text = new Intl.DateTimeFormat(language, options).format(date);
  } catch {
    text = new Intl.DateTimeFormat('en', options).format(date);
  }
  return `${text} UTC`;
}

function formatDate(isoOrSqlite: string, language: string): string {
  // SQLite's datetime() yields "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker.
  const normalised = /[zZ]|[+-]\d\d:?\d\d$/.test(isoOrSqlite)
    ? isoOrSqlite
    : `${isoOrSqlite.replace(' ', 'T')}Z`;
  const date = new Date(normalised);
  if (Number.isNaN(date.getTime())) return isoOrSqlite;
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  } catch {
    return isoOrSqlite;
  }
}

function createDocument(data: BrowseArticle): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: FOOTER_RESERVE, left: MARGIN, right: MARGIN },
    bufferPages: true,
    // Without this PDFKit loads Helvetica, whose encoding cannot hold most non-Latin text.
    font: path.join(fontDir, 'DejaVuSansCondensed.ttf'),
    info: {
      Title: data.article.title,
      Subject: data.project.title,
      Creator: 'Wikitail',
      Producer: 'Wikitail',
    },
  });
  doc.registerFont(FONTS.regular, path.join(fontDir, 'DejaVuSansCondensed.ttf'));
  doc.registerFont(FONTS.bold, path.join(fontDir, 'DejaVuSansCondensed-Bold.ttf'));
  doc.registerFont(FONTS.italic, path.join(fontDir, 'DejaVuSansCondensed-Oblique.ttf'));
  doc.registerFont(FONTS.boldItalic, path.join(fontDir, 'DejaVuSansCondensed-BoldOblique.ttf'));
  doc.registerFont(FONTS.mono, path.join(fontDir, 'DejaVuSansMono.ttf'));
  return doc;
}

function drawCover(
  doc: PDFKit.PDFDocument,
  data: BrowseArticle,
  L: PdfLabels,
  opts: PdfExportOptions,
) {
  const { width, height } = doc.page;
  const contentWidth = width - MARGIN * 2;
  const { article, project } = data;

  // Top band carries who the document was prepared for.
  const bandHeight = 96;
  doc.rect(0, 0, width, bandHeight).fill(ACCENT);
  doc.fillColor('#aebfd6').font(FONTS.regular).fontSize(8.5)
    .text(L.preparedFor.toUpperCase(), MARGIN, 32, { characterSpacing: 1.2, lineBreak: false });
  doc.fillColor('#ffffff').font(FONTS.bold).fontSize(16)
    .text(opts.email, MARGIN, 47, { width: contentWidth, lineBreak: false, ellipsis: true });

  doc.fillColor(ACCENT).font(FONTS.bold).fontSize(10.5)
    .text(project.title.toUpperCase(), MARGIN, 190, { width: contentWidth, characterSpacing: 1.4 });
  doc.moveDown(0.6);

  doc.fillColor(COLORS.text).font(FONTS.bold).fontSize(30)
    .text(article.title, MARGIN, doc.y, { width: contentWidth, lineGap: 4 });
  doc.y += 14;
  doc.save().lineWidth(3).strokeColor(ACCENT)
    .moveTo(MARGIN, doc.y).lineTo(MARGIN + 64, doc.y).stroke().restore();
  doc.y += 20;

  if (project.description) {
    doc.fillColor(COLORS.muted).font(FONTS.italic).fontSize(11.5)
      .text(project.description, MARGIN, doc.y, { width: contentWidth, lineGap: 3 });
    doc.y += 8;
  }
  doc.y += 18;

  const licence = findLicence(article.licenseId);
  const facts: [string, string][] = [
    [L.generated, formatDateTime(opts.generatedAt, article.language)],
    [L.language, article.language],
    [L.lastUpdated, formatDate(article.updatedAt, article.language)],
  ];
  if (licence) facts.push([L.licence, licence.name]);

  for (const [label, value] of facts) {
    const y = doc.y;
    doc.fillColor(COLORS.muted).font(FONTS.regular).fontSize(8.5)
      .text(label.toUpperCase(), MARGIN, y + 2, { width: 120, characterSpacing: 0.8, lineBreak: false });
    doc.fillColor(COLORS.text).font(FONTS.regular).fontSize(11)
      .text(value, MARGIN + 130, y, { width: contentWidth - 130 });
    doc.y = Math.max(doc.y, y + 14) + 7;
  }

  // Closing note, anchored to the bottom of the cover.
  const noteHeight = 70;
  const noteY = height - FOOTER_RESERVE - noteHeight;
  doc.save().rect(MARGIN, noteY, contentWidth, noteHeight).fill(COLORS.codeBg).restore();
  doc.rect(MARGIN, noteY, 4, noteHeight).fill(ACCENT);
  doc.fillColor(ACCENT).font(FONTS.bold).fontSize(12)
    .text(L.createdWith, MARGIN + 20, noteY + 14, { width: contentWidth - 40, lineBreak: false });
  doc.fillColor(COLORS.muted).font(FONTS.regular).fontSize(9)
    .text(L.snapshotNote, MARGIN + 20, noteY + 32, { width: contentWidth - 40, lineGap: 2 });
}

const externalOnly = (url: string | null | undefined) => (url && isExternalUrl(url) ? url : undefined);

/** Credit line in the same shape as the web page's licence badge. */
function creditRuns(item: LibraryItemSummary, L: PdfLabels): Run[] {
  if (item.author) {
    const runs: Run[] = [
      { text: item.title, link: externalOnly(item.externalUrl) },
      { text: ` ${L.by(item.author)}` },
    ];
    if (item.licenseName) {
      runs.push({ text: ' · ' }, { text: item.licenseName, link: externalOnly(item.licenseUrl) });
    }
    return runs;
  }

  const runs: Run[] = [];
  if (item.attributionText) runs.push({ text: item.attributionText });
  const source = externalOnly(item.externalUrl);
  if (source) runs.push({ text: `${runs.length ? ' ' : ''}${L.viewSource}`, link: source });
  return runs;
}

const isWikimediaSource = (item: LibraryItemSummary) =>
  item.sourceType === 'wikipedia' || item.sourceType === 'wikidata';

function scaledImage(doc: PDFKit.PDFDocument, buffer: Buffer, ctx: BlockContext) {
  const image = (doc as unknown as { openImage(src: Buffer): { width: number; height: number } })
    .openImage(buffer);
  const scale = Math.min(ctx.width / image.width, MAX_IMAGE_HEIGHT / image.height, 1);
  return { width: image.width * scale, height: image.height * scale };
}

function drawImage(doc: PDFKit.PDFDocument, buffer: Buffer, ctx: BlockContext) {
  const { width, height } = scaledImage(doc, buffer, ctx);
  ensureSpace(doc, height);
  doc.image(buffer, ctx.x, doc.y, { width, height });
  doc.y += height + 6;
}

/** Room a card wants up front, so its image is not stranded from what introduces it. */
function cardLeadHeight(doc: PDFKit.PDFDocument, image: Buffer | null, ctx: BlockContext): number {
  return 60 + (image ? scaledImage(doc, image, ctx).height : 0);
}

/** A library item as a bar-marked card: media, own words, title, caption, credit. */
function drawItemCard(
  doc: PDFKit.PDFDocument,
  item: LibraryItemSummary,
  image: Buffer | null,
  ctx: BlockContext,
  L: PdfLabels,
  extra: { label?: string; commentary?: string | null } = {},
) {
  const inner: BlockContext = { ...ctx, x: ctx.x + 12, width: ctx.width - 12, size: 9.5 };
  ensureSpace(doc, cardLeadHeight(doc, image, inner));
  doc.y += 4;
  const startPage = doc.bufferedPageRange().count;
  const top = doc.y;

  if (extra.commentary) {
    writeRuns(doc, [{ text: extra.commentary }], { ...inner, size: BODY_SIZE, lineGap: 3 });
    doc.y += 4;
  }
  if (image) drawImage(doc, image, inner);

  if (isWikimediaSource(item) && externalOnly(item.externalUrl)) {
    writeRuns(doc, [{ text: extra.label ?? item.title, link: externalOnly(item.externalUrl) }], {
      ...inner,
      size: 10,
    });
  } else {
    // A structured credit already opens with the title; showing it twice is noise.
    if (!image && !item.author) {
      writeRuns(doc, [{ text: extra.label ?? item.title, bold: true }], { ...inner, size: 10 });
    }
    if (item.description) {
      doc.y += 1;
      writeRuns(doc, [{ text: item.description, italic: true }], {
        ...inner,
        color: COLORS.muted,
      });
    }
    const credit = creditRuns(item, L);
    if (credit.length) {
      doc.y += 2;
      writeRuns(doc, credit, { ...inner, size: 8.5, color: COLORS.muted, lineGap: 1 });
    }
  }
  doc.y += 6;

  if (doc.bufferedPageRange().count === startPage) {
    doc.save().lineWidth(3).strokeColor(COLORS.rule)
      .moveTo(ctx.x + 1.5, top).lineTo(ctx.x + 1.5, doc.y - 4).stroke().restore();
  }
  doc.y += 4;
}

function drawFooters(doc: PDFKit.PDFDocument, data: BrowseArticle, L: PdfLabels) {
  const range = doc.bufferedPageRange();
  const label = `${data.project.title} · ${data.article.title}`;

  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    const { width, height, margins } = doc.page;
    const contentWidth = width - MARGIN * 2;
    const y = height - 40;
    // Writing inside the bottom margin would otherwise make PDFKit add a page.
    const bottom = margins.bottom;
    margins.bottom = 0;

    doc.save().lineWidth(0.5).strokeColor(COLORS.rule)
      .moveTo(MARGIN, y - 8).lineTo(width - MARGIN, y - 8).stroke().restore();
    doc.fillColor(COLORS.muted).font(FONTS.regular).fontSize(8)
      .text(label, MARGIN, y, { width: contentWidth - 90, lineBreak: false, ellipsis: true });
    doc.text(L.page(i + 1, range.count), MARGIN, y, {
      width: contentWidth,
      align: 'right',
      lineBreak: false,
    });

    margins.bottom = bottom;
  }
}

/**
 * Renders a published article as a PDF: a cover page (recipient, generation time,
 * project, title, a "created with Wikitail" note) followed by the article body
 * and its tail. Deliberately contains no link back to Wikitail — its address
 * differs per deployment. Links to external sources are kept.
 */
export async function renderArticlePdf(
  data: BrowseArticle,
  opts: PdfExportOptions,
): Promise<Buffer> {
  const L = labelsFor(data.article.language);
  const doc = createDocument(data);

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  try {
    const items = [...data.embeds, ...data.tail.map((entry) => entry.item)];
    const images = new Map<number, Buffer | null>();
    await Promise.all(
      items.map(async (item) => images.set(item.id, await loadImageForPdf(item))),
    );

    drawCover(doc, data, L, opts);
    doc.addPage();

    const ctx: BlockContext = {
      x: MARGIN,
      width: doc.page.width - MARGIN * 2,
      size: BODY_SIZE,
    };

    for (const segment of splitArticleBody(data.article.bodyMarkdown)) {
      if (segment.type === 'text') {
        renderMarkdownToPdf(doc, segment.text, ctx);
        continue;
      }
      const item = data.embeds.find((embed) => embed.id === segment.libraryItemId);
      if (item) {
        drawItemCard(doc, item, images.get(item.id) ?? null, ctx, L, { label: segment.label });
      } else if (segment.label) {
        writeRuns(doc, [{ text: segment.label, italic: true }], { ...ctx, color: COLORS.muted });
        doc.y += 6;
      }
    }

    if (data.tail.length) {
      const firstImage = images.get(data.tail[0].item.id) ?? null;
      ensureSpace(doc, 60 + cardLeadHeight(doc, firstImage, ctx));
      doc.y += 14;
      writeRuns(doc, [{ text: L.moreOnThis }], { ...ctx, size: 15, forceBold: true });
      doc.y += 6;
      for (const entry of data.tail) {
        drawItemCard(doc, entry.item, images.get(entry.item.id) ?? null, ctx, L, {
          commentary: entry.commentary,
        });
      }
    }

    drawFooters(doc, data, L);
    doc.end();
  } catch (err) {
    doc.destroy();
    throw err;
  }

  return finished;
}
