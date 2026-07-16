import type { ChatMessage, Collection, EfficiencyMetric, Screenshot } from "../../../shared/types/recall";

export interface MemoryRepository {
  getRecentScreenshots(): Promise<Screenshot[]>;
  getCollections(): Promise<Collection[]>;
  getEfficiencyMetrics(): Promise<EfficiencyMetric[]>;
  getChatMessages(): Promise<ChatMessage[]>;
}
