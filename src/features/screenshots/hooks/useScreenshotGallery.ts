import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { screenshotService } from "../services/screenshotService";
import { androidMediaPermissionService, type MediaPermissionStatus } from "../services/androidMediaPermissionService";

const PAGE_SIZE = 40;

function canReadImages(status: MediaPermissionStatus | "checking") {
  return status === "granted" || status === "limited";
}

export function useScreenshotGallery(pageSize = PAGE_SIZE) {
  const queryClient = useQueryClient();
  const [permissionStatus, setPermissionStatus] = useState<MediaPermissionStatus | "checking">("checking");

  const requestAccess = useCallback(async () => {
    const status = await androidMediaPermissionService.requestReadImagesPermission();
    setPermissionStatus(status);
    if (canReadImages(status)) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.screenshots });
    }
    return status;
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    androidMediaPermissionService.getReadImagesPermissionStatus().then(async (status) => {
      if (!active) return;
      if (status === "granted" || status === "limited" || status === "unsupported") {
        setPermissionStatus(status);
        return;
      }

      const requestedStatus = await androidMediaPermissionService.requestReadImagesPermission();
      if (active) setPermissionStatus(requestedStatus);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active") return;

      const status = await androidMediaPermissionService.getReadImagesPermissionStatus();
      setPermissionStatus(status);
      if (canReadImages(status)) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.screenshots });
      }
    });

    return () => subscription.remove();
  }, [queryClient]);

  const query = useInfiniteQuery({
    queryKey: queryKeys.screenshotPage(pageSize),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => screenshotService.listScreenshots(pageSize, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: canReadImages(permissionStatus)
  });

  useEffect(() => {
    if (!canReadImages(permissionStatus)) return;

    screenshotService.startWatching();
    const unsubscribe = screenshotService.subscribe(() => {
      screenshotService.syncFromMediaStore().finally(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.screenshots });
      });
    });

    return () => {
      unsubscribe();
      screenshotService.stopWatching();
    };
  }, [permissionStatus, queryClient]);

  const screenshots = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [query.data?.pages]);

  return {
    ...query,
    screenshots,
    permissionStatus,
    requestAccess,
    openSettings: () => androidMediaPermissionService.openSettings(),
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        query.fetchNextPage();
      }
    }
  };
}
