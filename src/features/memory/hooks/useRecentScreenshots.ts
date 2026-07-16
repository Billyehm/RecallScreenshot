import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { memoryService } from "../services/memoryService";

export function useRecentScreenshots() {
  return useQuery({
    queryKey: queryKeys.screenshots,
    queryFn: () => memoryService.getRecentScreenshots(),
    initialData: []
  });
}
