import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import type { StorageInfo } from "../native/ScreenshotMediaStore";
import { screenshotService } from "../services/screenshotService";

/** Shaped zeroes so a screen can render its rows before the first read resolves. */
const NO_STORAGE: StorageInfo = {
  databaseBytes: 0,
  thumbnailBytes: 0,
  indexedImages: 0,
  ocrRecords: 0,
  embeddings: 0,
  tokens: 0
};

/**
 * What the on-device index occupies, and how much of it each stage of the pipeline has produced.
 *
 * The numbers come from `PRAGMA page_count` and a directory walk, so they are cheap but not free —
 * hence the stale window. They only move when a batch completes, which is minutes apart at most.
 */
export function useStorageInfo(enabled = true) {
  const storage = useQuery({
    queryKey: queryKeys.storageInfo,
    queryFn: () => screenshotService.getStorageInfo(),
    enabled,
    staleTime: 30_000
  });

  return {
    storage: storage.data ?? NO_STORAGE,
    /** Everything the index holds on disk. Images are referenced by URI, so they are not counted. */
    totalBytes: (storage.data?.databaseBytes ?? 0) + (storage.data?.thumbnailBytes ?? 0),
    isLoading: storage.isPending && enabled,
    refresh: storage.refetch
  };
}
