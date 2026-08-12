import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { queryKeys } from "../../../shared/utils/queryKeys";
import type { CategoryCount, ScreenshotFilter } from "../domain/screenshotMetadata";
import { screenshotService } from "../services/screenshotService";
import { useLibrarySync } from "./useLibrarySync";
import { canReadImages, useMediaPermission } from "./useMediaPermission";

const PAGE_SIZE = 40;

/** Stable identity for an unfetched result, so consumers do not see a new array every render. */
const NO_COUNTS: CategoryCount[] = [];

type GalleryOptions = {
  pageSize?: number;
  filter?: ScreenshotFilter;
};

export function useScreenshotGallery({ pageSize = PAGE_SIZE, filter }: GalleryOptions = {}) {
  const queryClient = useQueryClient();
  const category = filter?.category;
  const collectionId = filter?.collectionId;

  const refreshScreenshots = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.screenshots });
  }, [queryClient]);

  const { status: permissionStatus, requestAccess, openSettings } = useMediaPermission(refreshScreenshots);
  const isReadable = canReadImages(permissionStatus);

  const query = useInfiniteQuery({
    queryKey: queryKeys.screenshotPage(pageSize, category, collectionId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => screenshotService.listScreenshots(pageSize, pageParam, { category, collectionId }),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: isReadable
  });

  const categoryCounts = useQuery({
    queryKey: queryKeys.categoryCounts,
    queryFn: () => screenshotService.countByCategory(),
    enabled: isReadable
  });

  useLibrarySync(isReadable);

  const screenshots = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [query.data?.pages]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  // Stable across renders: every list passes this straight to onEndReached, and a new identity on
  // each render invalidates the list's memoized props.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    ...query,
    screenshots,
    categoryCounts: categoryCounts.data ?? NO_COUNTS,
    permissionStatus,
    requestAccess,
    openSettings,
    loadMore
  };
}
