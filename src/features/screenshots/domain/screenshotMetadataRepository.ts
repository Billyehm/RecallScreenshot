import type { ScreenshotMetadata, MetadataSyncResult } from "./screenshotMetadata";

export interface ScreenshotMetadataRepository {
  initialize(): Promise<void>;
  syncFromMediaStore(pageSize?: number): Promise<MetadataSyncResult>;
  listIndexed(limit: number, offset: number): Promise<ScreenshotMetadata[]>;
  recordViewed(id: string, viewedAt: number): Promise<void>;
  startWatching(): void;
  stopWatching(): void;
  subscribe(listener: () => void): () => void;
}
