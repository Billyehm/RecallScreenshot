import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { memoryService } from "../services/memoryService";

export function useEfficiencyMetrics() {
  return useQuery({
    queryKey: queryKeys.efficiency,
    queryFn: () => memoryService.getEfficiencyMetrics(),
    initialData: []
  });
}
