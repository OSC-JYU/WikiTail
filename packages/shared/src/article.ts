/**
 * Article bodies reference library content with a `[[library:12|fi:Vesimylly]]`
 * shortcode, so the markdown stays the single source of truth and embeds survive
 * editing as plain text.
 *
 * The id is what resolves; the label after `|` is ignored when looking the item
 * up. It is there so the markdown reads sensibly, and so a body still says what
 * it meant if the library row behind it ever goes away. `[[library:12]]` without
 * a label remains valid.
 */
export type ArticleSegment =
  | { type: 'text'; text: string }
  | { type: 'library'; libraryItemId: number; label?: string };

const SHORTCODE = /\[\[library:(\d+)(?:\|([^\]|]*))?\]\]/g;

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

    const label = match[2]?.trim();
    segments.push({
      type: 'library',
      libraryItemId: Number(match[1]),
      ...(label ? { label } : {}),
    });
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
        .filter((s) => s.type === 'library')
        .map((s) => s.libraryItemId),
    ),
  ];
}

/**
 * Builds a shortcode. The label is descriptive only — an external id like
 * `fi:Vesimylly` says more than a title, and both beat a bare number when
 * reading the raw markdown.
 */
export function libraryShortcode(libraryItemId: number, label?: string | null): string {
  const clean = label?.replace(/[|\]]/g, '').trim();
  return clean ? `[[library:${libraryItemId}|${clean}]]` : `[[library:${libraryItemId}]]`;
}
