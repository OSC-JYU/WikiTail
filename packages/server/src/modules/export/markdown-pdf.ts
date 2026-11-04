import MarkdownIt from 'markdown-it';

// Same settings as the client renderer: author text, no raw HTML.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });
type Token = ReturnType<typeof md.parse>[number];

export const FONTS = {
  regular: 'Body',
  bold: 'Body-Bold',
  italic: 'Body-Italic',
  boldItalic: 'Body-BoldItalic',
  mono: 'Mono',
} as const;

export const COLORS = {
  text: '#1d2733',
  muted: '#5b6672',
  link: '#1a5fb4',
  rule: '#d5dae0',
  codeBg: '#f2f4f6',
};

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  link?: string;
}

export interface BlockContext {
  x: number;
  width: number;
  size: number;
}

export const isExternalUrl = (href: string) => /^(https?:|mailto:)/i.test(href);

function fontFor(run: Run, forceBold: boolean): string {
  if (run.code) return FONTS.mono;
  const bold = forceBold || run.bold;
  if (bold && run.italic) return FONTS.boldItalic;
  if (bold) return FONTS.bold;
  if (run.italic) return FONTS.italic;
  return FONTS.regular;
}

/**
 * Only absolute links survive. A relative href points into Wikitail itself, and
 * Wikitail's address changes between deployments, so in a document that outlives
 * the deployment it would be a dead link — the link text is kept, the link dropped.
 */
function inlineRuns(children: Token[]): Run[] {
  const runs: Run[] = [];
  let bold = 0;
  let italic = 0;
  let strike = 0;
  let link: string | undefined;

  for (const token of children) {
    switch (token.type) {
      case 'strong_open': bold++; break;
      case 'strong_close': bold--; break;
      case 'em_open': italic++; break;
      case 'em_close': italic--; break;
      case 's_open': strike++; break;
      case 's_close': strike--; break;
      case 'link_open': {
        const href = String(token.attrGet('href') ?? '');
        link = isExternalUrl(href) ? href : undefined;
        break;
      }
      case 'link_close': link = undefined; break;
      case 'softbreak': runs.push({ text: ' ' }); break;
      case 'hardbreak': runs.push({ text: '\n' }); break;
      case 'code_inline':
        runs.push({ text: token.content, code: true, link });
        break;
      case 'image':
        // Images in the body text are not fetched; the alt text stands in.
        if (token.content) runs.push({ text: token.content, italic: true });
        break;
      case 'text':
        runs.push({
          text: token.content,
          bold: bold > 0,
          italic: italic > 0,
          strike: strike > 0,
          link,
        });
        break;
    }
  }
  return runs;
}

export function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

export function writeRuns(
  doc: PDFKit.PDFDocument,
  runs: Run[],
  opts: {
    x: number;
    width: number;
    size: number;
    color?: string;
    forceBold?: boolean;
    align?: 'left' | 'center' | 'right';
    lineGap?: number;
  },
) {
  const visible = runs.filter((run) => run.text.length > 0);
  if (visible.length === 0) return;
  visible[0] = { ...visible[0], text: visible[0].text.replace(/^\s+/, '') };

  visible.forEach((run, i) => {
    doc
      .font(fontFor(run, opts.forceBold ?? false))
      .fontSize(opts.size)
      .fillColor(run.link ? COLORS.link : (opts.color ?? COLORS.text));
    const runOptions = {
      continued: i < visible.length - 1,
      link: run.link,
      underline: Boolean(run.link),
      strike: run.strike,
    };
    // Continued runs must not pass x/y at all, not even as undefined, or PDFKit
    // starts a new line; they inherit position and layout from the first run.
    if (i === 0) {
      doc.text(run.text, opts.x, doc.y, {
        ...runOptions,
        width: opts.width,
        align: opts.align ?? 'left',
        lineGap: opts.lineGap ?? 2,
      });
    } else {
      doc.text(run.text, runOptions);
    }
  });
}

const HEADING_SIZES: Record<string, number> = { h1: 19, h2: 16, h3: 13.5, h4: 12, h5: 11, h6: 10.5 };

/** Index of the token that closes the container opened at `open`. */
function closeIndex(tokens: Token[], open: number): number {
  const closeType = tokens[open].type.replace('_open', '_close');
  for (let j = open + 1; j < tokens.length; j++) {
    if (tokens[j].type === closeType && tokens[j].level === tokens[open].level) return j;
  }
  return tokens.length - 1;
}

/** Renders markdown at the document's current position, flowing across pages. */
export function renderMarkdownToPdf(doc: PDFKit.PDFDocument, markdown: string, ctx: BlockContext) {
  renderBlocks(doc, md.parse(markdown, {}), ctx, false);
}

function renderBlocks(doc: PDFKit.PDFDocument, tokens: Token[], ctx: BlockContext, tight: boolean) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case 'heading_open': {
        const size = HEADING_SIZES[token.tag] ?? 11;
        ensureSpace(doc, size * 3.5);
        doc.y += size * 0.5;
        writeRuns(doc, inlineRuns(tokens[i + 1].children ?? []), {
          x: ctx.x,
          width: ctx.width,
          size,
          forceBold: true,
        });
        doc.y += 4;
        i = closeIndex(tokens, i);
        break;
      }

      case 'paragraph_open': {
        ensureSpace(doc, ctx.size * 2);
        writeRuns(doc, inlineRuns(tokens[i + 1].children ?? []), {
          x: ctx.x,
          width: ctx.width,
          size: ctx.size,
          lineGap: 3,
        });
        doc.y += tight ? 2 : ctx.size * 0.7;
        i = closeIndex(tokens, i);
        break;
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const end = closeIndex(tokens, i);
        renderList(doc, tokens.slice(i + 1, end), ctx, token.type === 'ordered_list_open'
          ? Number(token.attrGet('start') ?? 1)
          : null);
        doc.y += ctx.size * 0.3;
        i = end;
        break;
      }

      case 'blockquote_open': {
        const end = closeIndex(tokens, i);
        const startPage = doc.bufferedPageRange().count;
        const top = doc.y;
        renderBlocks(doc, tokens.slice(i + 1, end), { ...ctx, x: ctx.x + 14, width: ctx.width - 14 }, false);
        // A bar that would have to span a page break is left out rather than drawn wrongly.
        if (doc.bufferedPageRange().count === startPage) {
          doc.save().lineWidth(2).strokeColor(COLORS.rule)
            .moveTo(ctx.x + 3, top).lineTo(ctx.x + 3, doc.y - ctx.size * 0.7).stroke().restore();
        }
        i = end;
        break;
      }

      case 'fence':
      case 'code_block': {
        renderCode(doc, token.content.replace(/\n$/, ''), ctx);
        break;
      }

      case 'hr': {
        ensureSpace(doc, 20);
        doc.y += 6;
        doc.save().lineWidth(0.7).strokeColor(COLORS.rule)
          .moveTo(ctx.x, doc.y).lineTo(ctx.x + ctx.width, doc.y).stroke().restore();
        doc.y += 10;
        break;
      }

      case 'table_open': {
        const end = closeIndex(tokens, i);
        renderTable(doc, tokens.slice(i + 1, end), ctx);
        i = end;
        break;
      }
    }
  }
}

function renderList(
  doc: PDFKit.PDFDocument,
  tokens: Token[],
  ctx: BlockContext,
  start: number | null,
) {
  const indent = start === null ? 16 : 22;
  let number = start ?? 0;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'list_item_open') continue;
    const end = closeIndex(tokens, i);
    const item = tokens.slice(i + 1, end);

    ensureSpace(doc, ctx.size * 2);
    const y = doc.y;
    doc
      .font(FONTS.regular)
      .fontSize(ctx.size)
      .fillColor(COLORS.text)
      .text(start === null ? '•' : `${number}.`, ctx.x, y, {
        width: indent - 4,
        align: 'right',
        lineBreak: false,
      });
    doc.y = y;

    const tight = item.some((t) => t.type === 'paragraph_open' && t.hidden);
    renderBlocks(doc, item, { ...ctx, x: ctx.x + indent, width: ctx.width - indent }, tight);
    number++;
    i = end;
  }
}

function renderCode(doc: PDFKit.PDFDocument, code: string, ctx: BlockContext) {
  const size = Math.max(ctx.size - 1.5, 8);
  const pad = 6;
  doc.font(FONTS.mono).fontSize(size);
  const height = doc.heightOfString(code, { width: ctx.width - pad * 2 }) + pad * 2;
  const room = doc.page.height - doc.page.margins.bottom - doc.page.margins.top;

  if (height <= room) {
    ensureSpace(doc, height);
    doc.save().roundedRect(ctx.x, doc.y, ctx.width, height, 3).fill(COLORS.codeBg).restore();
    doc.fillColor(COLORS.text).font(FONTS.mono).fontSize(size)
      .text(code, ctx.x + pad, doc.y + pad, { width: ctx.width - pad * 2 });
    doc.y += pad + ctx.size * 0.7;
  } else {
    // Longer than a page: no background, just let it flow.
    doc.fillColor(COLORS.text).text(code, ctx.x, doc.y, { width: ctx.width });
    doc.y += ctx.size * 0.7;
  }
}

interface TableRow {
  header: boolean;
  cells: Run[][];
}

function renderTable(doc: PDFKit.PDFDocument, tokens: Token[], ctx: BlockContext) {
  const rows: TableRow[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'tr_open') continue;
    const end = closeIndex(tokens, i);
    const row: TableRow = { header: false, cells: [] };
    for (let j = i + 1; j < end; j++) {
      if (tokens[j].type === 'th_open') row.header = true;
      if (tokens[j].type === 'th_open' || tokens[j].type === 'td_open') {
        row.cells.push(inlineRuns(tokens[j + 1].children ?? []));
      }
    }
    rows.push(row);
    i = end;
  }

  const columns = Math.max(0, ...rows.map((r) => r.cells.length));
  if (columns === 0) return;
  const cellWidth = ctx.width / columns;
  const size = ctx.size - 0.5;
  const pad = 4;

  for (const row of rows) {
    const heights = row.cells.map((runs) => {
      doc.font(row.header ? FONTS.bold : FONTS.regular).fontSize(size);
      return doc.heightOfString(runs.map((r) => r.text).join(''), { width: cellWidth - pad * 2 });
    });
    const rowHeight = Math.max(...heights, size) + pad * 2;
    ensureSpace(doc, rowHeight);
    const top = doc.y;

    if (row.header) {
      doc.save().rect(ctx.x, top, ctx.width, rowHeight).fill(COLORS.codeBg).restore();
    }
    row.cells.forEach((runs, c) => {
      doc.y = top + pad;
      writeRuns(doc, runs, {
        x: ctx.x + c * cellWidth + pad,
        width: cellWidth - pad * 2,
        size,
        forceBold: row.header,
        lineGap: 1,
      });
    });
    doc.y = top + rowHeight;
    doc.save().lineWidth(0.5).strokeColor(COLORS.rule)
      .moveTo(ctx.x, doc.y).lineTo(ctx.x + ctx.width, doc.y).stroke().restore();
  }
  doc.y += ctx.size * 0.7;
}
