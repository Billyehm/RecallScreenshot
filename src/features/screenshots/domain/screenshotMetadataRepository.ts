import type { CategoryCount, MetadataSyncResult, ScreenshotFilter, ScreenshotMetadata } from "./screenshotMetadata";

export interface ScreenshotMetadataRepository {
  initialize(): Promise<void>;
  syncFromMediaStore(pageSize?: number): Promise<MetadataSyncResult>;
  listIndexed(limit: number, offset: number, filter?: ScreenshotFilter): Promise<ScreenshotMetadata[]>;
  getById(id: string): Promise<ScreenshotMetadata | undefined>;
  countByCategory(): Promise<CategoryCount[]>;
  recordViewed(id: string, viewedAt: number): Promise<void>;
  startWatching(): void;
  stopWatching(): void;
  subscribe(listener: () => void): () => void;
}
