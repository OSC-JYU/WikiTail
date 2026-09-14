/**
 * Article bodies reference library content with a `[[library:12]]` shortcode, so
 * the markdown stays the single source of truth and embeds survive editing as
 * plain text.
 */
export type ArticleSegment =
  | { type: 'text'; text: string }
  | { type: 'library'; libraryItemId: number };

const SHORTCODE = /\[\[library:(\d+)\]\]/g;

/**
 * Splits a body into markdown runs and library embeds. Embeds are block-level:
 * the text on either side is rendered independently, so a shortcode cannot sit
 * inside a markdown construct such as a list item and still render as part of it.
 */
export function splitArticleBody(markdown: string): ArticleSegment[] {
  const segments: ArticleSegment[] = [];
  let cursor = 0;

  for (const match of markdown.matchAll(SHORTCODE)) {
    const start = match.index!;
    const before = markdown.slice(cursor, start);
    if (before.trim()) segments.push({ type: 'text', text: before });
    segments.push({ type: 'library', libraryItemId: Number(match[1]) });
    cursor = start + match[0].length;
  }

  const rest = markdown.slice(cursor);
  if (rest.trim()) segments.push({ type: 'text', text: rest });

  return segments;
}

/** Library items a body references, in order of first appearance. */
export function referencedLibraryIds(markdown: string): number[] {
  return [
    ...new Set(
      splitArticleBody(markdown)
        .filter((s): s is { type: 'library'; libraryItemId: number } => s.type === 'library')
        .map((s) => s.libraryItemId),
    ),
  ];
}

export function libraryShortcode(libraryItemId: number): string {
  return `[[library:${libraryItemId}]]`;
}
