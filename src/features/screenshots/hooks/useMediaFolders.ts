import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import type { MediaFolder } from "../native/ScreenshotMediaStore";
import { screenshotService } from "../services/screenshotService";

/** Module-level so an unfetched hook returns the same array every render. */
const NO_FOLDERS: MediaFolder[] = [];

/**
 * Device folders that hold images.
 *
 * Used by the search folder filter and by the Settings folder picker. Held for a long stale time
 * because folders are a property of how the device stores photos, not of what Recall has indexed —
 * they change when an app is installed, not when a batch finishes.
 */
export function useMediaFolders(enabled = true) {
  const folders = useQuery({
    queryKey: queryKeys.mediaFolders,
    queryFn: () => screenshotService.listFolders(),
    enabled,
    staleTime: 5 * 60_000
  });

  return { folders: folders.data ?? NO_FOLDERS, isLoading: folders.isPending && enabled };
}
