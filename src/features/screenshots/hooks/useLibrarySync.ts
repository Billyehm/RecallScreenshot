import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { screenshotService } from "../services/screenshotService";
import { useIndexStatus } from "./useIndexStatus";

/**
 * How long to wait after a MediaStore change before refreshing.
 *
 * The ContentObserver fires once per affected row, so saving a burst of screenshots or restoring a
 * backup arrives as a rapid volley. Refreshing on each one would re-run every list query dozens of
 * times for a single logical change.
 */
const REFRESH_DEBOUNCE_MS = 1500;

/**
 * Shortest gap between two progress-driven refreshes. Indexing a large library completes a batch
 * every few seconds, and re-running the list queries that often would spend more time re-reading
 * rows than showing them.
 */
const PROGRESS_REFRESH_MS = 10_000;

/**
 * Both shared across every caller so that N mounted galleries coalesce into one refresh rather than
 * N. Module scope rather than refs: the point is that separate components share the same clocks —
 * per-instance state would divide each interval by the number of mounted screens.
 */
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let lastProgressRefresh = 0;

/**
 * Keeps the index in step with the device library for as long as a screen is mounted.
 *
 * One place owns this so the read path does not: queries used to trigger a MediaStore scan on every
 * page-0 fetch, which re-enqueued the whole indexing pipeline each time a screen mounted or a cache
 * entry went stale. Here a scan happens when a screen opens and when the library actually changes.
 */
export function useLibrarySync(enabled: boolean) {
  const queryClient = useQueryClient();
  const index = useIndexStatus();

  useEffect(() => {
    if (!enabled) return;

    // Cheap on a warm index: the service suppresses repeats inside its cooldown window.
    void screenshotService.syncFromMediaStore();
    screenshotService.startWatching();

    const unsubscribe = screenshotService.subscribe(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void screenshotService
          .syncFromMediaStore()
          .finally(() => queryClient.invalidateQueries({ queryKey: queryKeys.screenshots }));
      }, REFRESH_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      screenshotService.stopWatching();
    };
  }, [enabled, queryClient]);

  // Indexing writes rows the ContentObserver never reports — it watches MediaStore, not our own
  // database — so without this a first run would show an empty library until something else
  // invalidated the cache. Throttled, because a large library finishes a batch every few seconds.
  //
  // Only the paged lists and the counts they are labelled with: the broad [screenshots] prefix would
  // also invalidate the status query this effect reads, refetching the source of its own trigger.
  useEffect(() => {
    if (!enabled || !index.indexed) return;

    const now = Date.now();
    const isSettled = index.state !== "running";
    if (!isSettled && now - lastProgressRefresh < PROGRESS_REFRESH_MS) return;

    lastProgressRefresh = now;
    void queryClient.invalidateQueries({ queryKey: queryKeys.screenshotPages });
    void queryClient.invalidateQueries({ queryKey: queryKeys.categoryCounts });
  }, [enabled, index.indexed, index.state, queryClient]);
}
