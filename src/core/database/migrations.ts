import { executeSql } from "./sqliteDatabase";

type Migration = {
  version: number;
  statements: string[];
};

const migrations: Migration[] = [
  {
    version: 1,
    statements: [
      `PRAGMA journal_mode = WAL`,
      `PRAGMA foreign_keys = ON`,
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS screenshot_metadata (
        id TEXT PRIMARY KEY,
        media_store_uri TEXT NOT NULL UNIQUE,
        absolute_path TEXT,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        date_created INTEGER NOT NULL DEFAULT 0,
        date_modified INTEGER NOT NULL DEFAULT 0,
        content_hash TEXT,
        processing_status TEXT NOT NULL DEFAULT 'Pending',
        ocr_status TEXT NOT NULL DEFAULT 'Pending',
        embedding_status TEXT NOT NULL DEFAULT 'Pending',
        favorite_flag INTEGER NOT NULL DEFAULT 0,
        hidden_flag INTEGER NOT NULL DEFAULT 0,
        archived_flag INTEGER NOT NULL DEFAULT 0,
        last_viewed_at INTEGER,
        view_count INTEGER NOT NULL DEFAULT 0,
        search_count INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        last_seen_scan_id TEXT,
        indexed_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS user_collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS screenshot_collections (
        screenshot_id TEXT NOT NULL,
        collection_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (screenshot_id, collection_id),
        FOREIGN KEY (screenshot_id) REFERENCES screenshot_metadata(id) ON DELETE CASCADE,
        FOREIGN KEY (collection_id) REFERENCES user_collections(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS user_notes (
        id TEXT PRIMARY KEY,
        screenshot_id TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (screenshot_id) REFERENCES screenshot_metadata(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS user_tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS screenshot_tags (
        screenshot_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (screenshot_id, tag_id),
        FOREIGN KEY (screenshot_id) REFERENCES screenshot_metadata(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES user_tags(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS search_history (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        result_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS favorites (
        screenshot_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (screenshot_id) REFERENCES screenshot_metadata(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_created ON screenshot_metadata(date_created DESC, id)`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_modified ON screenshot_metadata(date_modified DESC, id)`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_hash ON screenshot_metadata(content_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_flags ON screenshot_metadata(hidden_flag, archived_flag, is_deleted, date_created DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_scan ON screenshot_metadata(last_seen_scan_id)`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_file_name ON screenshot_metadata(file_name)`,
      `CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at DESC)`
    ]
  },
  {
    version: 2,
    statements: [
      `ALTER TABLE screenshot_metadata ADD COLUMN relative_path TEXT`,
      `ALTER TABLE screenshot_metadata ADD COLUMN mime_type TEXT NOT NULL DEFAULT 'image/*'`,
      `ALTER TABLE screenshot_metadata ADD COLUMN thumbnail_path TEXT`,
      `ALTER TABLE screenshot_metadata ADD COLUMN ocr_text TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE screenshot_metadata ADD COLUMN image_labels TEXT NOT NULL DEFAULT ''`,
      `ALTER TABLE screenshot_metadata ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'`,
      `ALTER TABLE screenshot_metadata ADD COLUMN embedding_vector BLOB`,
      `ALTER TABLE screenshot_metadata ADD COLUMN embedding_version INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE screenshot_metadata ADD COLUMN processing_error TEXT`,
      `ALTER TABLE screenshot_metadata ADD COLUMN processing_attempts INTEGER NOT NULL DEFAULT 0`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_processing ON screenshot_metadata(is_deleted, processing_status, date_created DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_category ON screenshot_metadata(is_deleted, category, date_created DESC)`
    ]
  },
  {
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS screenshot_ocr (
        screenshot_id TEXT PRIMARY KEY NOT NULL,
        extracted_text TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        language TEXT NOT NULL DEFAULT 'und',
        processed_at INTEGER NOT NULL DEFAULT 0
      )`,
      `ALTER TABLE screenshot_metadata ADD COLUMN auto_tags TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE screenshot_metadata ADD COLUMN category_confidence REAL NOT NULL DEFAULT 0`,
      // Category names predate the supported set; rewriting the rows avoids a full re-index.
      `UPDATE screenshot_metadata SET category = 'Social Media' WHERE category = 'Social'`,
      `UPDATE screenshot_metadata SET category = 'Messages' WHERE category = 'Messaging'`,
      // Listing a collection's contents seeks by collection_id, which the composite key cannot serve.
      `CREATE INDEX IF NOT EXISTS idx_screenshot_collections_collection ON screenshot_collections(collection_id, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_user_collections_name ON user_collections(name)`
    ]
  },
  {
    version: 4,
    statements: [
      // Phase 3 gives vectors their own row keyed by screenshot, carrying the model version that
      // produced them. The native indexer creates the same table, so whichever layer opens the
      // shared database first wins and the other is a no-op.
      `CREATE TABLE IF NOT EXISTS screenshot_embeddings (
        screenshot_id TEXT PRIMARY KEY NOT NULL,
        vector BLOB NOT NULL,
        dimensions INTEGER NOT NULL DEFAULT 0,
        model_version INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (screenshot_id) REFERENCES screenshot_metadata(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_embeddings_version ON screenshot_embeddings(model_version)`,
      // Carry existing vectors across so search keeps working while the library re-indexes at the
      // new model version. Dimensions come from the blob length rather than a column the JS schema
      // may not have yet. OR IGNORE leaves anything the indexer already wrote untouched.
      `INSERT OR IGNORE INTO screenshot_embeddings (screenshot_id, vector, dimensions, model_version, created_at)
       SELECT id, embedding_vector, LENGTH(embedding_vector) / 4, embedding_version, updated_at
       FROM screenshot_metadata
       WHERE embedding_vector IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history(query)`
    ]
  },
  {
    version: 5,
    statements: [
      // The list queries order by (date_created DESC, id DESC) so that offset paging is stable across
      // rows sharing a timestamp. The version 1 and 2 indexes stop at date_created, so SQLite had to
      // sort the entire visible set to break those ties — on every page, not just the first. Carrying
      // id into the index makes the ordering a plain index walk.
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_visible ON screenshot_metadata(
        is_deleted, hidden_flag, archived_flag, date_created DESC, id DESC
      )`,
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_visible_category ON screenshot_metadata(
        is_deleted, hidden_flag, archived_flag, category, date_created DESC, id DESC
      )`,
      // countByCategory groups completed rows by category behind the same three flags. Every column
      // it touches is here, so the count runs off the index without reading the table at all.
      `CREATE INDEX IF NOT EXISTS idx_screenshot_metadata_category_counts ON screenshot_metadata(
        is_deleted, hidden_flag, archived_flag, processing_status, category
      )`,
      // Both are strict prefixes of the two indexes above — same equality columns, shorter tail — so
      // they can no longer win a query. Every redundant index is maintained on each of the thousands
      // of row writes an initial index performs, which is where the cost actually lands.
      `DROP INDEX IF EXISTS idx_screenshot_metadata_category`,
      `DROP INDEX IF EXISTS idx_screenshot_metadata_flags`,
      // Keeps the planner's row estimates honest now that several indexes could serve one query.
      `ANALYZE`
    ]
  }
];

let migrationPromise: Promise<void> | null = null;

export function runDatabaseMigrations() {
  migrationPromise ??= runMigrations();
  return migrationPromise;
}

async function runMigrations() {
  await executeSql(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`);

  for (const migration of migrations) {
    const existing = await executeSql<{ version: number }>(`SELECT version FROM schema_migrations WHERE version = ? LIMIT 1`, [migration.version]);
    if (existing.rows?._array.length) continue;

    for (const statement of migration.statements) {
      try {
        await executeSql(statement);
      } catch (error) {
        // The native WorkManager store can initialize the shared schema before JS bootstrap.
        if (!String(error).toLowerCase().includes("duplicate column")) throw error;
      }
    }

    await executeSql(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, [migration.version, Date.now()]);
  }
}
