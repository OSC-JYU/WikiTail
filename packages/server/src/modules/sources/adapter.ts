import type { SourceSearchResult, SourceSnapshot, SourceType } from '@wikitail/shared';

/**
 * Contract every external source (Wikipedia, Commons, Wikidata, Finna) implements.
 * Adding a source means adding an adapter and registering it — the import pipeline
 * and library storage stay unchanged.
 */
export interface SourceAdapter {
  key: SourceType;
  search(
    query: string,
    opts?: { limit?: number; language?: string },
  ): Promise<SourceSearchResult[]>;
  /**
   * `includeBody: false` asks for metadata only — the project keeps links rather
   * than copies, so fetching a whole article would be wasted work.
   */
  importItem(externalId: string, opts?: { includeBody?: boolean }): Promise<SourceSnapshot>;
  /**
   * Language versions of the same thing, without fetching its content — used to
   * fill in siblings for an item already in the library. Sources with no notion
   * of language versions can leave this out.
   */
  resolveSiblings?(externalId: string): Promise<{
    conceptId?: string;
    siblings: Record<string, string>;
  }>;
}
