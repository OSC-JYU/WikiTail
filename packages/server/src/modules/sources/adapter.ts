import type { SourceSearchPage, SourceSnapshot, SourceType } from '@wikitail/shared';

/**
 * Contract every external source (Wikipedia, Commons, Wikidata, Finna) implements.
 * Adding a source means adding an adapter and registering it — the import pipeline
 * and library storage stay unchanged.
 */
export interface SourceAdapter {
  key: SourceType;
  search(
    query: string,
    /**
     * `types` is a source-specific filter — only Finna uses it today, to
     * scope a search to image/audio/video/text records. Other adapters ignore
     * it. Kept loose (`string[]`) so the shared contract doesn't need to know
     * every source's facet vocabulary.
     *
     * `offset` is the number of results already shown — callers page by
     * passing `offset = results.length`. Adapters translate this to whatever
     * their source expects (Wikipedia/Commons: `gsroffset`; Finna: `page`).
     */
    opts?: {
      limit?: number;
      language?: string;
      types?: string[];
      offset?: number;
      /**
       * Whether the "reusable" hint in results treats NC (NonCommercial)
       * licences as copyable. Only Finna's search uses this; it mirrors the
       * project setting so the hint matches what import will actually do.
       */
      allowNonCommercial?: boolean;
    },
  ): Promise<SourceSearchPage>;
  /**
   * `includeBody: false` asks for metadata only — the project keeps links rather
   * than copies. For Wikipedia this drops the article HTML; for Commons it
   * skips downloading audio/video so the reader gets the embedded Commons
   * player instead of a local file. Images are always downloaded either way,
   * because a page needs to render them immediately.
   *
   * `allowNonCommercial` mirrors the project's setting for whether Finna
   * material under a NonCommercial licence is copied in rather than kept as a
   * link. Other adapters ignore it — Wikipedia and Commons are freely licensed
   * or ND, which do not depend on the deployment's commercial status.
   */
  importItem(
    externalId: string,
    opts?: { includeBody?: boolean; allowNonCommercial?: boolean },
  ): Promise<SourceSnapshot>;
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
