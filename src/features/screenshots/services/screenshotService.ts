import { colors } from "../../../shared/theme/colors";
import type { Screenshot } from "../../../shared/types/recall";
import { SQLiteScreenshotMetadataRepository } from "../data/sqliteScreenshotMetadataRepository";
import type { ScreenshotMetadataRepository } from "../domain/screenshotMetadataRepository";

export class ScreenshotService {
  private syncPromise: Promise<unknown> | null = null;

  constructor(private readonly repository: ScreenshotMetadataRepository) {}

  async listScreenshots(limit: number, offset: number) {
    if (offset === 0) {
      await this.syncFromMediaStore();
    }

    const items = await this.repository.listIndexed(limit, offset);
    return {
      items: items.map((item): Screenshot => ({
        id: item.id,
        title: item.fileName,
        source: item.absolutePath ? "MediaStore" : "Screenshots",
        time: formatRelativeTime(item.dateCreated),
        accent: colors.primary,
        icon: "image",
        uri: item.mediaStoreUri,
        createdAt: item.dateCreated,
        modifiedAt: item.dateModified,
        size: item.fileSize,
        width: item.width,
        height: item.height
      })),
      nextOffset: items.length >= limit ? offset + limit : undefined
    };
  }

  syncFromMediaStore() {
    this.syncPromise ??= this.repository.syncFromMediaStore().finally(() => {
      this.syncPromise = null;
    });

    return this.syncPromise;
  }

  startWatching() {
    this.repository.startWatching();
  }

  stopWatching() {
    this.repository.stopWatching();
  }

  subscribe(listener: () => void) {
    return this.repository.subscribe(listener);
  }
}

export const screenshotService = new ScreenshotService(new SQLiteScreenshotMetadataRepository());

function formatRelativeTime(timestamp: number) {
  const elapsed = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < hour) return `${Math.max(1, Math.floor(elapsed / minute))} mins ago`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} hours ago`;
  return `${Math.floor(elapsed / day)} days ago`;
}
