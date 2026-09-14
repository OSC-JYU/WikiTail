import type { SourceSearchResult, SourceSnapshot, SourceType } from '@wikitail/shared';

/**
 * Contract every external source (Wikipedia, Commons, Wikidata, Finna) implements.
 * Adding a source means adding an adapter and registering it — the import pipeline
 * and library storage stay unchanged.
 */
export interface SourceAdapter {
  key: SourceType;
  search(query: string, opts?: { limit?: number }): Promise<SourceSearchResult[]>;
  importItem(externalId: string): Promise<SourceSnapshot>;
}
