import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { searchService } from "../services/searchService";

/**
 * Visually and topically related images for the one currently open.
 *
 * Keyed on the content URI rather than the row id because that is what the native side needs: an
 * image the indexer has not reached yet has no stored vector, and is embedded on demand from the URI.
 */
export function useSimilarScreenshots(contentUri: string | undefined, limit = 12) {
  const query = useQuery({
    queryKey: queryKeys.similarScreenshots(contentUri ?? ""),
    queryFn: () => searchService.findSimilar(contentUri!, limit),
    enabled: Boolean(contentUri),
    staleTime: 60_000
  });

  return { similar: query.data ?? [], isLoading: query.isLoading };
}
