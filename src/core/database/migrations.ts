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
      await executeSql(statement);
    }

    await executeSql(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, [migration.version, Date.now()]);
  }
}
