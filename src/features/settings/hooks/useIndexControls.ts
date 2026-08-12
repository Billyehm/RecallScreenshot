import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { queryKeys } from "../../../shared/utils/queryKeys";
import type { IndexScope } from "../../screenshots/native/ScreenshotMediaStore";
import { screenshotService } from "../../screenshots/services/screenshotService";

/**
 * The privacy and indexing switches behind the Settings screen.
 *
 * Every one of these changes what the index holds, so each invalidates the screenshot tree rather
 * than a single key: counts, folder rows, storage totals and status all read from the same tables
 * and would otherwise keep showing pre-change numbers. Search results are invalidated too, since a
 * cleared index cannot answer the query that produced them.
 */
export function useIndexControls() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.screenshots }),
      queryClient.invalidateQueries({ queryKey: queryKeys.search })
    ]);
  }, [queryClient]);

  /** Pause and resume only touch the schedule, so the cached listings stay valid. */
  const setPaused = useMutation({
    mutationFn: (paused: boolean) => (paused ? screenshotService.pauseIndexing() : screenshotService.resumeIndexing()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.indexStatus })
  });

  const setFolders = useMutation({
    mutationFn: (folders: string[]) => screenshotService.setIndexedFolders(folders),
    onSuccess: invalidate
  });

  /** Changes what counts as indexable. Narrowing retires rows, so the whole tree has to be refetched. */
  const setScope = useMutation({
    mutationFn: (scope: IndexScope) => screenshotService.setIndexScope(scope),
    onSuccess: invalidate
  });

  const clearAiData = useMutation({
    mutationFn: () => screenshotService.clearAiData(),
    onSuccess: invalidate
  });

  const deleteDatabase = useMutation({
    mutationFn: () => screenshotService.deleteDatabase(),
    onSuccess: async () => {
      // Categories live in the same database, so the collection tree goes with it.
      await Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: queryKeys.collections })]);
    }
  });

  return {
    setPaused: setPaused.mutateAsync,
    setFolders: setFolders.mutateAsync,
    setScope: setScope.mutateAsync,
    clearAiData: clearAiData.mutateAsync,
    deleteDatabase: deleteDatabase.mutateAsync,
    isPausing: setPaused.isPending,
    isSavingFolders: setFolders.isPending,
    isSavingScope: setScope.isPending,
    isClearing: clearAiData.isPending || deleteDatabase.isPending
  };
}
