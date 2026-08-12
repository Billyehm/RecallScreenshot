import type { SearchHit, SearchRequest } from "./searchResult";

export interface SearchRepository {
  /** Hybrid text + semantic + metadata search over the on-device index. */
  search(request: SearchRequest): Promise<SearchHit[]>;
  /** Images that look like the one at [contentUri], excluding it. */
  findSimilar(contentUri: string, limit: number): Promise<SearchHit[]>;
  /**
   * Records a committed search so repeat lookups feed the engagement ranking signal.
   * Never rejects: a failed statistic must not fail a search.
   */
  recordSearch(query: string, resultIds: string[]): Promise<void>;
}
