import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { screenshotService } from "../services/screenshotService";

const PAGE_SIZE = 40;

export function useScreenshotGallery(pageSize = PAGE_SIZE) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: queryKeys.screenshotPage(pageSize),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => screenshotService.listScreenshots(pageSize, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextOffset
  });

  useEffect(() => {
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
  }, [queryClient]);

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
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        query.fetchNextPage();
      }
    }
  };
}
