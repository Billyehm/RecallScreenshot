import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { screenshotService } from "../services/screenshotService";

/**
 * Live indexing counts. Polled rather than pushed: WorkManager runs the pipeline out of process, so
 * there is no event to subscribe to, and progress only moves a batch at a time.
 */
export function useIndexStatus() {
  const status = useQuery({
    queryKey: queryKeys.indexStatus,
    queryFn: () => screenshotService.getIndexStatus(),
    refetchInterval: (query) => (query.state.data?.state === "running" ? 4_000 : false),
    staleTime: 4_000
  });

  const data = status.data;
  return {
    state: data?.state ?? "idle",
    indexed: data?.completed ?? 0,
    pending: (data?.pending ?? 0) + (data?.processing ?? 0),
    failed: data?.failed ?? 0,
    discovered: data?.discovered ?? 0,
    deviceImages: data?.deviceImages ?? 0,
    indexable: data?.indexableImages ?? 0,
    lastError: data?.lastError ?? null,
    /** Nothing has been processed yet, so an empty result set means "not ready", not "no match". */
    isEmpty: (data?.completed ?? 0) === 0
  };
}
