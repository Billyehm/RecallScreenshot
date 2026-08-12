import type { Screenshot } from "../../../shared/types/recall";

/** One ranked hit: the image itself, plus why it is here. */
export type SearchHit = {
  screenshot: Screenshot;
  /** Combined ranking score. Comparable within one result set, not across searches. */
  score: number;
  /** Indexed terms this image carries that the query asked for. */
  matchedTerms: string[];
};

/**
 * Explicit filters from the search screen. Each is a hard exclusion, unlike the category and date
 * window the query phrase itself implies — those only influence ranking.
 */
export type SearchFilters = {
  category?: string;
  /** Half-open epoch-millis window. Omitted or equal bounds mean no date constraint. */
  fromMillis?: number;
  toMillis?: number;
  /** Only images where recognized text was found. */
  hasText?: boolean;
  /** Matched against the image's folder path. */
  folder?: string;
};

/** True when at least one filter would actually exclude something. Narrows so callers can read on. */
export function hasActiveFilters(filters?: SearchFilters): filters is SearchFilters {
  if (!filters) return false;
  return Boolean(
    filters.category ||
      filters.hasText ||
      filters.folder ||
      (filters.toMillis ?? 0) > (filters.fromMillis ?? 0)
  );
}

/** What the user is asking for. An empty query with a filter set browses that slice. */
export type SearchRequest = {
  query: string;
  /**
   * Kept alongside [filters] because the category chip predates the filter panel and several
   * screens still pass only a category. It is folded into the filters at the repository boundary.
   */
  category?: string;
  filters?: SearchFilters;
  limit?: number;
};

export type SearchResults = {
  hits: SearchHit[];
  /** Echoed back so a stale response can be told apart from the current one. */
  request: SearchRequest;
};
