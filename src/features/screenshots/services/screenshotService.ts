import { colors } from "../../../shared/theme/colors";
import type { Screenshot } from "../../../shared/types/recall";
import { formatRelativeTime } from "../../../shared/utils/relativeTime";
import { SQLiteScreenshotMetadataRepository } from "../data/sqliteScreenshotMetadataRepository";
import type { ScreenshotFilter, ScreenshotMetadata } from "../domain/screenshotMetadata";
import type { ScreenshotMetadataRepository } from "../domain/screenshotMetadataRepository";
import { ScreenshotMediaStore, type IndexScope } from "../native/ScreenshotMediaStore";

/**
 * Shortest gap between two MediaStore scans. A scan re-enqueues the WorkManager pipeline, so
 * running one per screen mount would keep the indexer awake for no new work — the ContentObserver
 * already reports genuine library changes.
 */
const SYNC_COOLDOWN_MS = 30_000;

export class ScreenshotService {
  private syncPromise: Promise<unknown> | null = null;
  private lastSyncAt = 0;
  /**
   * How many screens currently want change notifications. Reference counted because several
   * galleries are mounted at once — Home behind the Library modal, for one — and an unbalanced
   * stopWatching() from whichever unmounts first would blind the others.
   */
  private watcherCount = 0;

  constructor(private readonly repository: ScreenshotMetadataRepository) {}

  async listScreenshots(limit: number, offset: number, filter?: ScreenshotFilter) {
    const items = await this.repository.listIndexed(limit, offset, filter);
    return {
      items: items.map(toScreenshot),
      nextOffset: items.length >= limit ? offset + limit : undefined
    };
  }

  async getScreenshot(id: string) {
    const item = await this.repository.getById(id);
    return item ? toScreenshot(item) : undefined;
  }

  countByCategory() {
    return this.repository.countByCategory();
  }

  recordViewed(id: string) {
    return this.repository.recordViewed(id, Date.now());
  }

  /**
   * Deletes the underlying file. From Android 11 the platform shows its own confirmation dialog, so
   * this resolves false when the user declines it — that is a normal outcome, not a failure. The
   * index row is dropped natively only after a confirmed delete.
   */
  deleteScreenshot(contentUri: string) {
    return ScreenshotMediaStore.deleteImage(contentUri);
  }

  /**
   * Deletes several files behind one confirmation. The platform dialog takes the whole list, so a
   * multi-select delete asks once rather than once per image, and resolves false if it is declined.
   */
  deleteScreenshots(contentUris: string[]) {
    return ScreenshotMediaStore.deleteImages(contentUris);
  }

  /** Hands the image to the system share sheet by reference; nothing is copied. */
  shareScreenshot(contentUri: string, mimeType?: string) {
    return ScreenshotMediaStore.shareImage(contentUri, mimeType);
  }

  /** Same as [shareScreenshot] for a selection, via the system multi-share sheet. */
  shareScreenshots(contentUris: string[], mimeType?: string) {
    return ScreenshotMediaStore.shareImages(contentUris, mimeType);
  }

  /**
   * Rescans MediaStore and re-queues anything new. In-flight calls share one promise, and a
   * completed scan suppresses further ones for the cooldown, so the read path never pays for a
   * scan it did not need. Pass force for an explicit user action such as pull-to-refresh.
   */
  syncFromMediaStore(force = false) {
    if (this.syncPromise) return this.syncPromise;
    if (!force && Date.now() - this.lastSyncAt < SYNC_COOLDOWN_MS) return Promise.resolve();

    this.syncPromise = this.repository.syncFromMediaStore().finally(() => {
      this.lastSyncAt = Date.now();
      this.syncPromise = null;
    });

    return this.syncPromise;
  }

  startWatching() {
    this.watcherCount += 1;
    if (this.watcherCount === 1) {
      this.repository.startWatching();
    }
  }

  stopWatching() {
    this.watcherCount = Math.max(0, this.watcherCount - 1);
    if (this.watcherCount === 0) {
      this.repository.stopWatching();
    }
  }

  subscribe(listener: () => void) {
    return this.repository.subscribe(listener);
  }

  getIndexStatus() {
    return ScreenshotMediaStore.getIndexStatus();
  }

  /** Device folders holding images, with how many of each has been indexed so far. */
  listFolders() {
    return ScreenshotMediaStore.listFolders();
  }

  pauseIndexing() {
    return ScreenshotMediaStore.pauseIndexing();
  }

  resumeIndexing() {
    return ScreenshotMediaStore.resumeIndexing();
  }

  /** Restricts indexing to the named folders. An empty list means every folder. */
  setIndexedFolders(folders: string[]) {
    return ScreenshotMediaStore.setIndexedFolders(folders);
  }

  /** Which kinds of image are indexed. Screenshots only unless the user has widened it. */
  getIndexScope() {
    return ScreenshotMediaStore.getIndexScope();
  }

  /**
   * Changes what counts as indexable and rescans. Narrowing retires the images that no longer
   * qualify; none of them are deleted from the device.
   */
  setIndexScope(scope: IndexScope) {
    return ScreenshotMediaStore.setIndexScope(scope);
  }

  /** What the index occupies on disk. The images themselves are referenced, never copied. */
  getStorageInfo() {
    return ScreenshotMediaStore.getStorageInfo();
  }

  /** Drops OCR, embeddings and labels, then re-queues the library. Images are untouched. */
  clearAiData() {
    return ScreenshotMediaStore.clearAiData();
  }

  /** Drops the whole index, categories included. Nothing on the device library is deleted. */
  deleteDatabase() {
    return ScreenshotMediaStore.deleteDatabase();
  }
}

export const screenshotService = new ScreenshotService(new SQLiteScreenshotMetadataRepository());

function toScreenshot(item: ScreenshotMetadata): Screenshot {
  return {
    id: item.id,
    title: item.fileName,
    source: "Device library",
    time: formatRelativeTime(item.dateCreated),
    accent: colors.primary,
    icon: "image",
    // Lists render the cached thumbnail; the full-resolution original is only loaded by the viewer,
    // which is the whole point of generating thumbnails.
    uri: item.thumbnailPath ? `file://${item.thumbnailPath}` : item.mediaStoreUri,
    fullUri: item.mediaStoreUri,
    createdAt: item.dateCreated,
    modifiedAt: item.dateModified,
    size: item.fileSize,
    width: item.width,
    height: item.height,
    category: item.category,
    categoryConfidence: item.categoryConfidence,
    tags: item.autoTags,
    ocrText: item.ocr.text,
    ocrConfidence: item.ocr.confidence,
    ocrLanguage: item.ocr.language,
    collectionIds: item.collectionIds,
    isIndexed: item.processingStatus === "Completed"
  };
}
