import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { memoryService } from "../services/memoryService";

export function useCollections() {
  return useQuery({
    queryKey: queryKeys.collections,
    queryFn: () => memoryService.getCollections(),
    initialData: []
  });
}
