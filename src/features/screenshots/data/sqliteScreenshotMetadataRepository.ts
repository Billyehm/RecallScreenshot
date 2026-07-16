import { executeMany, executeSql } from "../../../core/database/sqliteDatabase";
import { runDatabaseMigrations } from "../../../core/database/migrations";
import type { ScreenshotMetadata, MetadataSyncResult } from "../domain/screenshotMetadata";
import type { ScreenshotMetadataRepository } from "../domain/screenshotMetadataRepository";
import { ScreenshotMediaStore, type NativeScreenshot } from "../native/ScreenshotMediaStore";
import { androidMediaPermissionService } from "../services/androidMediaPermissionService";

const DEFAULT_SYNC_PAGE_SIZE = 500;

type ScreenshotRow = {
  id: string;
  media_store_uri: string;
  absolute_path?: string;
  file_name: string;
  file_size: number;
  width: number;
  height: number;
  date_created: number;
  date_modified: number;
  content_hash?: string;
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

  async syncFromMediaStore(pageSize = DEFAULT_SYNC_PAGE_SIZE): Promise<MetadataSyncResult> {
    await this.initialize();

    const hasPermission = await androidMediaPermissionService.requestReadImagesPermission();
    if (!hasPermission || !ScreenshotMediaStore.isAvailable) {
      return { scanId: "", upserted: 0, deleted: 0 };
    }

    const scanId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let offset = 0;
    let upserted = 0;

    while (true) {
      const page = await ScreenshotMediaStore.queryScreenshots(pageSize, offset);
      if (page.length === 0) break;

      const commands = [];
      for (const item of dedupe(page)) {
        const existing = await executeSql<ScreenshotRow>(
          `SELECT id, date_modified, file_size, content_hash FROM screenshot_metadata WHERE id = ? LIMIT 1`,
          [item.id]
        );
        const existingRow = existing.rows?._array[0];
        const hasChanged = !existingRow || existingRow.date_modified !== item.modifiedAt || existingRow.file_size !== item.size;
        const contentHash = hasChanged ? await ScreenshotMediaStore.getSha256(item.uri) : existingRow?.content_hash;

        commands.push({
          query: `INSERT INTO screenshot_metadata (
            id, media_store_uri, absolute_path, file_name, file_size, width, height,
            date_created, date_modified, content_hash, processing_status, ocr_status,
            embedding_status, favorite_flag, hidden_flag, archived_flag, view_count,
            search_count, is_deleted, last_seen_scan_id, indexed_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Pending', 'Pending', 0, 0, 0, 0, 0, 0, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            media_store_uri = excluded.media_store_uri,
            absolute_path = excluded.absolute_path,
            file_name = excluded.file_name,
            file_size = excluded.file_size,
            width = excluded.width,
            height = excluded.height,
            date_created = excluded.date_created,
            date_modified = excluded.date_modified,
            content_hash = COALESCE(excluded.content_hash, screenshot_metadata.content_hash),
            is_deleted = 0,
            last_seen_scan_id = excluded.last_seen_scan_id,
            updated_at = excluded.updated_at`,
          params: [
            item.id,
            item.uri,
            item.absolutePath ?? null,
            item.fileName || item.title,
            item.size,
            item.width,
            item.height,
            item.createdAt,
            item.modifiedAt,
            contentHash ?? null,
            scanId,
            Date.now(),
            Date.now()
          ]
        });
      }

      if (commands.length) {
        await executeMany(commands);
        upserted += commands.length;
      }

      if (page.length < pageSize) break;
      offset += pageSize;
    }

    const deletedResult = await executeSql(
      `UPDATE screenshot_metadata
       SET is_deleted = 1, updated_at = ?
       WHERE is_deleted = 0 AND (last_seen_scan_id IS NULL OR last_seen_scan_id != ?)`,
      [Date.now(), scanId]
    );

    return {
      scanId,
      upserted,
      deleted: deletedResult.rowsAffected
    };
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

function dedupe(items: NativeScreenshot[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
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
    dateCreated: row.date_created,
    dateModified: row.date_modified,
    contentHash: row.content_hash,
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
