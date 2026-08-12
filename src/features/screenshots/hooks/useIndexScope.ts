import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import type { IndexScope } from "../native/ScreenshotMediaStore";
import { screenshotService } from "../services/screenshotService";

/**
 * Which kinds of image indexing is allowed to read.
 *
 * Held for a long stale time because it only changes when the user changes it, and it is written
 * through a mutation that invalidates this key. Defaults to the narrower scope while loading so the
 * Settings row never briefly claims the whole library is being indexed.
 */
export function useIndexScope(enabled = true) {
  const scope = useQuery({
    queryKey: queryKeys.indexScope,
    queryFn: () => screenshotService.getIndexScope(),
    enabled,
    staleTime: 5 * 60_000
  });

  const value: IndexScope = scope.data ?? "screenshotsOnly";
  return { scope: value, isLoading: scope.isPending && enabled };
}
