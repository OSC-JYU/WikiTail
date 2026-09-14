import sanitizeHtml from 'sanitize-html';

/** Parsoid returns a full document; only the body is worth snapshotting. */
function extractBody(html: string): string {
  const open = html.match(/<body[^>]*>/i);
  if (!open) return html;
  const start = open.index! + open[0].length;
  const end = html.lastIndexOf('</body>');
  return end === -1 ? html.slice(start) : html.slice(start, end);
}

/**
 * Resolves the link forms Parsoid emits: "./Article_Name" for wiki links,
 * "//host/path" protocol-relative, and bare "#fragment" anchors (whose targets
 * are stripped along with element ids, so they point back at the live article).
 */
function resolveUrl(href: string, title: string, wikiBase: string): string | undefined {
  if (href.startsWith('./')) return `${wikiBase}/wiki/${href.slice(2)}`;
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('#')) return `${wikiBase}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}${href}`;
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  return undefined;
}

/**
 * `language` decides which wiki relative links resolve against — a Finnish
 * snapshot's "./Vesimylly" must point at fi.wikipedia.org, not en.
 */
export function sanitizeArticleHtml(html: string, title: string, language: string): string {
  const wikiBase = `https://${language}.wikipedia.org`;
  return sanitizeHtml(extractBody(html), {
    allowedTags: [
      'section', 'p', 'div', 'span', 'br', 'hr',
      'b', 'i', 'strong', 'em', 'u', 's', 'sub', 'sup', 'small', 'bdi',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'blockquote', 'q', 'cite', 'code', 'pre', 'abbr', 'time',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      'figure', 'figcaption', 'img', 'a',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['lang', 'dir', 'colspan', 'rowspan', 'scope'],
    },
    // class/id/style are dropped: Wikipedia's stylesheet is not loaded here, so
    // they add bulk without effect, and style would let imported markup escape
    // our layout.
    allowedSchemes: ['https', 'http', 'mailto'],
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ? resolveUrl(attribs.href, title, wikiBase) : undefined;
        if (!href) {
          return { tagName: 'span', attribs: {} };
        }
        return {
          tagName: 'a',
          attribs: {
            href,
            ...(attribs.title ? { title: attribs.title } : {}),
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
          },
        };
      },
      img: (tagName, attribs) => {
        const src = attribs.src?.startsWith('//') ? `https:${attribs.src}` : attribs.src;
        // srcset is dropped rather than rewritten URL-by-URL; src alone renders fine.
        return {
          tagName: 'img',
          attribs: {
            ...(src ? { src } : {}),
            ...(attribs.alt ? { alt: attribs.alt } : {}),
            ...(attribs.width ? { width: attribs.width } : {}),
            ...(attribs.height ? { height: attribs.height } : {}),
          },
        };
      },
    },
  });
}
