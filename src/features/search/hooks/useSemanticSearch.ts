import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { hasActiveFilters, type SearchFilters } from "../domain/searchResult";
import { SearchService, searchService } from "../services/searchService";
import { useDebouncedValue } from "./useDebouncedValue";

type SemanticSearchOptions = {
  query: string;
  category?: string;
  filters?: SearchFilters;
  limit?: number;
  /** False while the library is unreadable, so no search runs against an empty index. */
  enabled?: boolean;
};

/**
 * Debounced hybrid search over the on-device index.
 *
 * `keepPreviousData` matters more here than it usually does: without it the grid empties between
 * every debounce window, so refining a query reads as the results disappearing and coming back.
 */
export function useSemanticSearch({ query, category, filters, limit = 40, enabled = true }: SemanticSearchOptions) {
  const debouncedQuery = useDebouncedValue(query);
  const request = { query: debouncedQuery, category, filters, limit };
  const isRunnable = SearchService.isRunnable(request);

  const results = useQuery({
    // Folded into the key via a stable signature: an ordered tuple of only the fields that change
    // the result, so adding or removing a filter busts the entry but editing the query string does
    // not thrash it twice.
    queryKey: queryKeys.searchResults(debouncedQuery.trim(), category, filterSignature(filters)),
    queryFn: () => searchService.search(request),
    enabled: enabled && isRunnable,
    placeholderData: keepPreviousData,
    // The index only changes when the worker completes a batch, so a short window avoids
    // re-scanning on every remount while the user refines a query.
    staleTime: 30_000
  });

  return {
    hits: results.data?.hits ?? [],
    /** True while a search is in flight, including the gap before the debounce settles. */
    isSearching: isRunnable && (results.isFetching || debouncedQuery !== query),
    isActive: isRunnable,
    error: results.error
  };
}

/** Stable, order-independent fingerprint of the active filters, used as the query-key suffix. */
function filterSignature(filters?: SearchFilters): string | undefined {
  if (!hasActiveFilters(filters)) return undefined;
  const parts = [] as string[];
  if (filters.category) parts.push(`c:${filters.category}`);
  if (filters.hasText) parts.push("t:1");
  if (filters.folder) parts.push(`f:${filters.folder}`);
  if ((filters.toMillis ?? 0) > (filters.fromMillis ?? 0)) {
    parts.push(`d:${filters.fromMillis ?? 0}-${filters.toMillis ?? 0}`);
  }
  return parts.join("|");
}
