import { NativeSearchRepository } from "../data/nativeSearchRepository";
import type { SearchRepository } from "../domain/searchRepository";
import { hasActiveFilters, type SearchRequest, type SearchResults } from "../domain/searchResult";

/** Below this a query matches most of the library, so it is not worth running or recording. */
const MIN_QUERY_LENGTH = 2;

export class SearchService {
  constructor(private readonly repository: SearchRepository) {}

  /**
   * True when the request asks for anything at all. A filter with no phrase is a real request — it
   * browses that slice by recency — so it must not be dropped for failing the phrase-length check.
   */
  static isRunnable({ query, category, filters }: SearchRequest) {
    return query.trim().length >= MIN_QUERY_LENGTH || Boolean(category) || hasActiveFilters(filters);
  }

  async search(request: SearchRequest): Promise<SearchResults> {
    if (!SearchService.isRunnable(request)) return { hits: [], request };

    const hits = await this.repository.search(request);
    // Recorded after the fact and never awaited by the caller: the count is a ranking signal, not
    // part of the answer.
    void this.repository.recordSearch(
      request.query,
      hits.map((hit) => hit.screenshot.id)
    );

    return { hits, request };
  }

  findSimilar(contentUri: string, limit = 12) {
    return this.repository.findSimilar(contentUri, limit);
  }
}

export const searchService = new SearchService(new NativeSearchRepository());
