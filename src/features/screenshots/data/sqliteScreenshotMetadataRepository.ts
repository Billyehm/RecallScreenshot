import { executeSql } from "../../../core/database/sqliteDatabase";
import { runDatabaseMigrations } from "../../../core/database/migrations";
import type {
  CategoryCount,
  MetadataSyncResult,
  ScreenshotFilter,
  ScreenshotMetadata
} from "../domain/screenshotMetadata";
import type { ScreenshotMetadataRepository } from "../domain/screenshotMetadataRepository";
import { ScreenshotMediaStore } from "../native/ScreenshotMediaStore";
import { androidMediaPermissionService } from "../services/androidMediaPermissionService";

/**
 * Recognized text is capped for list queries. A single text-heavy screenshot can hold tens of
 * kilobytes, and a page of forty would otherwise pull megabytes through the bridge to render
 * previews that only ever show the first line.
 */
const OCR_SNIPPET_CHARS = 2000;

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
  ocr_confidence: number;
  ocr_language: string;
  category: string;
  category_confidence: number;
  auto_tags: string;
  processing_status: string;
  ocr_status: string;
  embedding_status: string;
  favorite_flag: number;
  hidden_flag: number;
  archived_flag: number;
  last_viewed_at?: number;
  view_count: number;
  search_count: number;
  collection_ids?: string;
};

/**
 * Recognized text lives in screenshot_ocr, not in screenshot_metadata: the indexing pipeline
 * deliberately leaves metadata.ocr_text empty so that scanning the metadata table stays cheap.
 * Every read that needs text therefore joins.
 */
function selectColumns(textExpression: string) {
  return `SELECT
      m.id, m.media_store_uri, m.absolute_path, m.file_name, m.file_size, m.width, m.height,
      m.mime_type, m.date_created, m.date_modified, m.content_hash, m.thumbnail_path,
      ${textExpression} AS ocr_text,
      COALESCE(o.confidence, 0) AS ocr_confidence,
      COALESCE(o.language, 'und') AS ocr_language,
      m.category, m.category_confidence, m.auto_tags,
      m.processing_status, m.ocr_status, m.embedding_status,
      m.favorite_flag, m.hidden_flag, m.archived_flag,
      m.last_viewed_at, m.view_count, m.search_count,
      (
        SELECT GROUP_CONCAT(sc.collection_id)
        FROM screenshot_collections sc
        WHERE sc.screenshot_id = m.id
      ) AS collection_ids
    FROM screenshot_metadata m
    LEFT JOIN screenshot_ocr o ON o.screenshot_id = m.id`;
}

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

  async listIndexed(limit: number, offset: number, filter?: ScreenshotFilter): Promise<ScreenshotMetadata[]> {
    await this.initialize();

    const conditions = ["m.is_deleted = 0", "m.hidden_flag = 0", "m.archived_flag = 0"];
    const params: Array<string | number> = [];

    if (filter?.category) {
      conditions.push("m.category = ?");
      params.push(filter.category);
    }

    if (filter?.collectionId) {
      conditions.push(
        "EXISTS (SELECT 1 FROM screenshot_collections sc WHERE sc.screenshot_id = m.id AND sc.collection_id = ?)"
      );
      params.push(filter.collectionId);
    }

    const result = await executeSql<ScreenshotRow>(
      `${selectColumns(`SUBSTR(COALESCE(o.extracted_text, ''), 1, ${OCR_SNIPPET_CHARS})`)}
       WHERE ${conditions.join(" AND ")}
       ORDER BY m.date_created DESC, m.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return (result.rows?._array ?? []).map(mapRow);
  }

  /** Full recognized text, not the list snippet: the viewer shows everything that was read. */
  async getById(id: string): Promise<ScreenshotMetadata | undefined> {
    await this.initialize();

    const result = await executeSql<ScreenshotRow>(
      `${selectColumns("COALESCE(o.extracted_text, '')")} WHERE m.id = ? LIMIT 1`,
      [id]
    );

    const row = result.rows?._array?.[0];
    return row ? mapRow(row) : undefined;
  }

  async countByCategory(): Promise<CategoryCount[]> {
    await this.initialize();

    const result = await executeSql<{ category: string; count: number }>(
      `SELECT category, COUNT(*) AS count
       FROM screenshot_metadata
       WHERE is_deleted = 0 AND hidden_flag = 0 AND archived_flag = 0 AND processing_status = 'Completed'
       GROUP BY category
       ORDER BY count DESC, category ASC`
    );

    return (result.rows?._array ?? []).map((row) => ({ category: row.category, count: row.count }));
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
    thumbnailPath: row.thumbnail_path ?? undefined,
    ocr: {
      text: row.ocr_text ?? "",
      confidence: row.ocr_confidence ?? 0,
      language: row.ocr_language || "und"
    },
    category: row.category,
    categoryConfidence: row.category_confidence ?? 0,
    autoTags: parseTags(row.auto_tags),
    processingStatus: row.processing_status as ScreenshotMetadata["processingStatus"],
    ocrStatus: row.ocr_status as ScreenshotMetadata["ocrStatus"],
    embeddingStatus: row.embedding_status as ScreenshotMetadata["embeddingStatus"],
    favoriteFlag: row.favorite_flag === 1,
    hiddenFlag: row.hidden_flag === 1,
    archivedFlag: row.archived_flag === 1,
    collectionIds: row.collection_ids ? row.collection_ids.split(",").filter(Boolean) : [],
    userNotes: undefined,
    userTags: [],
    lastViewedAt: row.last_viewed_at,
    viewCount: row.view_count,
    searchCount: row.search_count
  };
}

/** Tags are written by the native pipeline as a JSON array; a malformed value must not break a list. */
function parseTags(value: string | undefined): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string" && tag.length > 0) : [];
  } catch {
    return [];
  }
}
