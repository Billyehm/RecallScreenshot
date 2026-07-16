import { MockMemoryRepository } from "../data/mockMemoryRepository";
import type { MemoryRepository } from "../domain/memoryRepository";

export class MemoryService {
  constructor(private readonly repository: MemoryRepository) {}

  getRecentScreenshots() {
    return this.repository.getRecentScreenshots();
  }

  getCollections() {
    return this.repository.getCollections();
  }

  getEfficiencyMetrics() {
    return this.repository.getEfficiencyMetrics();
  }

  getChatMessages() {
    return this.repository.getChatMessages();
  }
}

export const memoryService = new MemoryService(new MockMemoryRepository());
