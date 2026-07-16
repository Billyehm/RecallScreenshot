import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { memoryService } from "../services/memoryService";

export function useChatMessages() {
  return useQuery({
    queryKey: queryKeys.chatMessages,
    queryFn: () => memoryService.getChatMessages(),
    initialData: []
  });
}
