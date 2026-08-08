import { executeSql } from "../../../core/database/sqliteDatabase";
import { runDatabaseMigrations } from "../../../core/database/migrations";
import type { ScreenshotMetadata, MetadataSyncResult } from "../domain/screenshotMetadata";
import type { ScreenshotMetadataRepository } from "../domain/screenshotMetadataRepository";
import { ScreenshotMediaStore } from "../native/ScreenshotMediaStore";
import { androidMediaPermissionService } from "../services/androidMediaPermissionService";

type ScreenshotRow = {
  id: string;
  media_store_uri: string;
  absolute_path?: string;
  file_name: string;
  file_size: number;
  width: number;
  height: number;
  mime_type: string;
  date_created: number;
  date_modified: number;
  content_hash?: string;
  thumbnail_path?: string;
  ocr_text: string;
  category: string;
  processing_status: string;
  ocr_status: string;
  embedding_status: string;
  favorite_flag: number;
  hidden_flag: number;
  archived_flag: number;
  last_viewed_at?: number;
  view_count: number;
  search_count: number;
};

export class SQLiteScreenshotMetadataRepository implements ScreenshotMetadataRepository {
  async initialize() {
    await runDatabaseMigrations();
  }

  async syncFromMediaStore(): Promise<MetadataSyncResult> {
    await this.initialize();

    const permissionStatus = await androidMediaPermissionService.requestReadImagesPermission();
    if ((permissionStatus !== "granted" && permissionStatus !== "limited") || !ScreenshotMediaStore.isAvailable) {
      return { scanId: "", upserted: 0, deleted: 0 };
    }

    await ScreenshotMediaStore.startIndexing();
    return { scanId: `${Date.now()}`, upserted: 0, deleted: 0 };
  }

  async listIndexed(limit: number, offset: number): Promise<ScreenshotMetadata[]> {
    await this.initialize();

    const result = await executeSql<ScreenshotRow>(
      `SELECT * FROM screenshot_metadata
       WHERE is_deleted = 0 AND hidden_flag = 0 AND archived_flag = 0
       ORDER BY date_created DESC, id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return (result.rows?._array ?? []).map(mapRow);
  }

  async recordViewed(id: string, viewedAt: number) {
    await executeSql(
      `UPDATE screenshot_metadata
       SET last_viewed_at = ?, view_count = view_count + 1, updated_at = ?
       WHERE id = ?`,
      [viewedAt, viewedAt, id]
    );
  }

  startWatching() {
    ScreenshotMediaStore.startWatching();
  }

  stopWatching() {
    ScreenshotMediaStore.stopWatching();
  }

  subscribe(listener: () => void) {
    return ScreenshotMediaStore.subscribe(listener);
  }
}

function mapRow(row: ScreenshotRow): ScreenshotMetadata {
  return {
    id: row.id,
    mediaStoreUri: row.media_store_uri,
    absolutePath: row.absolute_path,
    fileName: row.file_name,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    dateCreated: row.date_created,
    dateModified: row.date_modified,
    contentHash: row.content_hash,
    thumbnailPath: row.thumbnail_path,
    ocrText: row.ocr_text,
    category: row.category,
    processingStatus: row.processing_status as ScreenshotMetadata["processingStatus"],
    ocrStatus: row.ocr_status as ScreenshotMetadata["ocrStatus"],
    embeddingStatus: row.embedding_status as ScreenshotMetadata["embeddingStatus"],
    favoriteFlag: row.favorite_flag === 1,
    hiddenFlag: row.hidden_flag === 1,
    archivedFlag: row.archived_flag === 1,
    collectionIds: [],
    userNotes: undefined,
    userTags: [],
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
    searchCount: row.search_count
  };
}
