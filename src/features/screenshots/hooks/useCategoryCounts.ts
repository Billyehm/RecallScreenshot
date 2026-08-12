import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import type { CategoryCount } from "../domain/screenshotMetadata";
import { screenshotService } from "../services/screenshotService";

const NO_COUNTS: CategoryCount[] = [];

/**
 * How many indexed images sit in each category.
 *
 * Separate from the gallery hook so a screen that only needs the category list — the search filter
 * sheet, settings — does not also start paging every image to get it. Both share one cache entry.
 */
export function useCategoryCounts(enabled = true) {
  const counts = useQuery({
    queryKey: queryKeys.categoryCounts,
    queryFn: () => screenshotService.countByCategory(),
    enabled
  });

  return counts.data ?? NO_COUNTS;
}
