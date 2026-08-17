package com.recallai.screenshots

import android.content.ContentValues
import android.content.Context
import android.content.ContextWrapper
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

data class PendingImage(
  val id: String,
  val uri: String,
  val fileName: String,
  val modifiedAt: Long,
  /** Existing cached thumbnail, deleted by exact name once the new one is written. */
  val thumbnailPath: String?,
  val relativePath: String = "",
)

data class SearchRow(
  val id: String,
  val uri: String,
  val fileName: String,
  val thumbnailPath: String?,
  val ocrText: String,
  val category: String,
  val tags: List<String>,
  val categoryConfidence: Float,
  val ocrConfidence: Float,
  val ocrLanguage: String,
  val embedding: FloatArray?,
  val createdAt: Long,
  val modifiedAt: Long,
  val size: Long,
  val width: Int,
  val height: Int,
  val mimeType: String,
  val relativePath: String,
  /** Engagement signals; the ranker uses them to break ties toward images the user returns to. */
  val viewCount: Int = 0,
  val searchCount: Int = 0,
  /** Whether OCR found any text. Read from the metadata flag, not from the text itself. */
  val hasText: Boolean = false,
)

/** What the index itself occupies. Images are referenced by URI, never copied, so they are absent. */
data class StorageFootprint(
  val databaseBytes: Long,
  val indexedImages: Long,
  val ocrRecords: Long,
  val embeddings: Long,
  val tokens: Long,
)

data class IndexCounts(
  val pending: Int,
  val processing: Int,
  val completed: Int,
  val failed: Int,
)

data class IndexFailure(val message: String)

/**
 * Resolves database names into [Context.getFilesDir] instead of the platform `databases/` directory.
 *
 * react-native-nitro-sqlite roots every connection at `filesDir` and only accepts a location below
 * it, so JS cannot be pointed at `databases/`. Without this wrapper both layers open a file named
 * recall_ai.db, land on two different inodes, and never observe each other's rows.
 */
private class FilesDirContext(base: Context) : ContextWrapper(base) {
  override fun getDatabasePath(name: String): File = File(filesDir, name)
}

/**
 * Native access to the same app database opened by react-native-nitro-sqlite.
 * SQLite serializes writers; WAL keeps JS reads responsive while WorkManager indexes.
 *
 * Everything here is plain SQL on purpose. The JS side runs nitro-sqlite's bundled amalgamation
 * (built without SQLITE_ENABLE_FTS*) while this side uses the platform engine, so no virtual-table
 * module can be assumed present on both. Full-text ranking uses the explicit token index below.
 */
class RecallIndexStore(context: Context) : SQLiteOpenHelper(
  FilesDirContext(context),
  DATABASE_NAME,
  null,
  DATABASE_VERSION,
) {
  init {
    setWriteAheadLoggingEnabled(true)
  }

  override fun onConfigure(db: SQLiteDatabase) {
    db.setForeignKeyConstraintsEnabled(true)
  }

  override fun onCreate(db: SQLiteDatabase) = ensureSchema(db)

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = ensureSchema(db)

  override fun onDowngrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = ensureSchema(db)

  fun ensureReady() = ensureSchema(writableDatabase)

  private fun ensureSchema(db: SQLiteDatabase) {
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS screenshot_metadata (
        id TEXT PRIMARY KEY NOT NULL,
        media_store_uri TEXT NOT NULL UNIQUE,
        absolute_path TEXT,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        mime_type TEXT NOT NULL DEFAULT 'image/*',
        date_created INTEGER NOT NULL DEFAULT 0,
        date_modified INTEGER NOT NULL DEFAULT 0,
        content_hash TEXT,
        thumbnail_path TEXT,
        ocr_text TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'Other',
        processing_status TEXT NOT NULL DEFAULT 'Pending',
        ocr_status TEXT NOT NULL DEFAULT 'Pending',
        embedding_status TEXT NOT NULL DEFAULT 'Pending',
        favorite_flag INTEGER NOT NULL DEFAULT 0,
        hidden_flag INTEGER NOT NULL DEFAULT 0,
        archived_flag INTEGER NOT NULL DEFAULT 0,
        collection_ids TEXT NOT NULL DEFAULT '[]',
        user_notes TEXT,
        user_tags TEXT NOT NULL DEFAULT '[]',
        last_viewed_at INTEGER,
        view_count INTEGER NOT NULL DEFAULT 0,
        search_count INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        last_seen_scan_id TEXT,
        embedding_vector BLOB,
        embedding_version INTEGER NOT NULL DEFAULT 0,
        embedding_dimensions INTEGER NOT NULL DEFAULT 0,
        image_labels TEXT NOT NULL DEFAULT '',
        auto_tags TEXT NOT NULL DEFAULT '[]',
        category_confidence REAL NOT NULL DEFAULT 0,
        processing_attempts INTEGER NOT NULL DEFAULT 0,
        processing_error TEXT,
        indexed_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0,
        relative_path TEXT
      )
      """.trimIndent(),
    )
    // Read before the ALTER loop below adds it: once the column exists, "was it already here?" is no
    // longer answerable, and that is exactly what decides whether the backfill has to run.
    val hasTextIsNew = !hasColumn(db, "has_text")
    REQUIRED_COLUMNS.forEach { (name, definition) ->
      if (!hasColumn(db, name)) db.execSQL("ALTER TABLE screenshot_metadata ADD COLUMN $name $definition")
    }
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS screenshot_ocr (
        screenshot_id TEXT PRIMARY KEY NOT NULL,
        extracted_text TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        language TEXT NOT NULL DEFAULT 'und',
        processed_at INTEGER NOT NULL DEFAULT 0
      )
      """.trimIndent(),
    )

    /**
     * Vectors live in their own narrow table rather than as a column on the metadata row: the
     * ranking scan reads one blob per image and nothing else, and the model version travels with
     * the vector it produced instead of with the queue state.
     */
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS screenshot_embeddings (
        screenshot_id TEXT PRIMARY KEY NOT NULL,
        vector BLOB NOT NULL,
        dimensions INTEGER NOT NULL DEFAULT 0,
        model_version INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (screenshot_id) REFERENCES screenshot_metadata(id) ON DELETE CASCADE
      )
      """.trimIndent(),
    )
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_screenshot_embeddings_version ON screenshot_embeddings(model_version)")

    /**
     * Inverted index: one row per (token, screenshot). Replaces a LIKE '%token%' scan over every
     * OCR blob with an index seek per query token, which is what makes search survive a library of
     * thousands. WITHOUT ROWID keeps the token/id pair in the primary B-tree with no extra lookup.
     */
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS screenshot_ocr_tokens (
        token TEXT NOT NULL,
        screenshot_id TEXT NOT NULL,
        hits INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (token, screenshot_id)
      ) WITHOUT ROWID
      """.trimIndent(),
    )
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_ocr_tokens_screenshot ON screenshot_ocr_tokens(screenshot_id)")
    db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_screenshot_uri ON screenshot_metadata(media_store_uri)")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_screenshot_queue ON screenshot_metadata(is_deleted, processing_status, processing_attempts, date_modified DESC)")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_screenshot_category ON screenshot_metadata(category, is_deleted)")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_screenshot_thumbnail ON screenshot_metadata(is_deleted, processing_status, date_modified DESC)")

    // One-time reconciliation for libraries indexed before the column existed. Runs off the OCR table
    // that already holds the answer, so nothing is re-processed and no image is read again.
    if (hasTextIsNew) {
      db.execSQL(
        """
        UPDATE screenshot_metadata SET has_text = 1
        WHERE EXISTS (
          SELECT 1 FROM screenshot_ocr o
          WHERE o.screenshot_id = screenshot_metadata.id AND TRIM(o.extracted_text) != ''
        )
        """.trimIndent(),
      )
    }
  }

  private fun hasColumn(db: SQLiteDatabase, name: String): Boolean =
    db.rawQuery("PRAGMA table_info(screenshot_metadata)", null).use { cursor ->
      val index = cursor.getColumnIndex("name")
      generateSequence { if (cursor.moveToNext()) cursor.getString(index) else null }.any { it == name }
    }

  /**
   * Non-exclusive so WAL readers on the JS connection stay unblocked. The scanner commits in
   * chunks rather than one transaction for the whole library: batching removes the per-row fsync
   * that made a 10k scan take minutes, while the periodic commit keeps the writer lock short
   * enough that concurrent JS reads do not hit SQLITE_BUSY.
   */
  fun beginScanChunk() = writableDatabase.beginTransactionNonExclusive()

  fun commitScanChunk() {
    val db = writableDatabase
    db.setTransactionSuccessful()
    db.endTransaction()
  }

  fun rollbackScanChunk() = writableDatabase.endTransaction()

  fun upsertDiscovered(image: IndexedImage, scanId: String): Boolean {
    val db = writableDatabase
    val current = db.rawQuery(
      "SELECT date_modified, file_size, embedding_version, is_deleted FROM screenshot_metadata WHERE id = ?",
      arrayOf(image.id),
    ).use { cursor ->
      if (!cursor.moveToFirst()) null else ExistingImage(
        cursor.getLong(0), cursor.getLong(1), cursor.getInt(2), cursor.getInt(3) == 0,
      )
    }
    val requiresProcessing = current == null || current.modifiedAt != image.modifiedAt ||
      current.size != image.size || current.embeddingVersion != OfflineImageIntelligence.EMBEDDING_VERSION ||
      !current.isActive

    val values = ContentValues().apply {
      put("id", image.id)
      put("media_store_uri", image.uri)
      put("file_name", image.fileName)
      put("file_size", image.size)
      put("width", image.width)
      put("height", image.height)
      put("mime_type", image.mimeType)
      put("relative_path", image.relativePath)
      put("date_created", image.createdAt)
      put("date_modified", image.modifiedAt)
      put("is_deleted", 0)
      put("last_seen_scan_id", scanId)
      put("updated_at", System.currentTimeMillis())
      if (requiresProcessing) {
        put("processing_status", "Pending")
        put("ocr_status", "Pending")
        put("embedding_status", "Pending")
        put("processing_attempts", 0)
        putNull("processing_error")
        put("indexed_at", 0)
      }
    }
    if (current == null) db.insertOrThrow("screenshot_metadata", null, values)
    else db.update("screenshot_metadata", values, "id = ?", arrayOf(image.id))
    return requiresProcessing
  }

  fun finishScan(scanId: String, allowDeletion: Boolean): Int {
    if (!allowDeletion) return 0
    val values = ContentValues().apply { put("is_deleted", 1); put("updated_at", System.currentTimeMillis()) }
    return writableDatabase.update(
      "screenshot_metadata", values,
      "is_deleted = 0 AND (last_seen_scan_id IS NULL OR last_seen_scan_id != ?)", arrayOf(scanId),
    )
  }

  fun claimBatch(limit: Int): List<PendingImage> {
    val db = writableDatabase
    val result = mutableListOf<PendingImage>()
    db.beginTransactionNonExclusive()
    try {
      db.rawQuery(
        """
        SELECT id, media_store_uri, file_name, date_modified, thumbnail_path, relative_path
        FROM screenshot_metadata
        WHERE is_deleted = 0
          AND (processing_status IN ('Pending', 'Failed') OR embedding_version != ?)
          AND processing_attempts < ?
        ORDER BY date_modified DESC
        LIMIT ?
        """.trimIndent(),
        arrayOf(OfflineImageIntelligence.EMBEDDING_VERSION.toString(), MAX_ATTEMPTS.toString(), limit.toString()),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          result += PendingImage(
            id = cursor.getString(0),
            uri = cursor.getString(1),
            fileName = cursor.getString(2),
            modifiedAt = cursor.getLong(3),
            thumbnailPath = if (cursor.isNull(4)) null else cursor.getString(4),
            relativePath = if (cursor.isNull(5)) "" else cursor.getString(5),
          )
        }
      }
      if (result.isNotEmpty()) {
        val placeholders = result.joinToString(",") { "?" }
        db.execSQL(
          """
          UPDATE screenshot_metadata
          SET processing_status = 'Processing', ocr_status = 'Processing', embedding_status = 'Processing',
              processing_attempts = processing_attempts + 1, processing_error = NULL, updated_at = ?
          WHERE id IN ($placeholders)
          """.trimIndent(),
          arrayOf<Any>(System.currentTimeMillis(), *result.map { it.id }.toTypedArray()),
        )
      }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
    return result
  }

  /** Recent completed rows whose cached thumbnail may have been reclaimed from cacheDir. */
  fun thumbnailCandidates(limit: Int): List<PendingImage> {
    val result = mutableListOf<PendingImage>()
    readableDatabase.rawQuery(
      """
      SELECT id, media_store_uri, file_name, date_modified, thumbnail_path
      FROM screenshot_metadata
      WHERE is_deleted = 0 AND processing_status = 'Completed'
      ORDER BY date_modified DESC
      LIMIT ?
      """.trimIndent(),
      arrayOf(limit.toString()),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        result += PendingImage(
          id = cursor.getString(0),
          uri = cursor.getString(1),
          fileName = cursor.getString(2),
          modifiedAt = cursor.getLong(3),
          thumbnailPath = if (cursor.isNull(4)) null else cursor.getString(4),
        )
      }
    }
    return result
  }

  fun updateThumbnail(id: String, path: String) {
    val values = ContentValues().apply {
      put("thumbnail_path", path)
      put("updated_at", System.currentTimeMillis())
    }
    writableDatabase.update("screenshot_metadata", values, "id = ?", arrayOf(id))
  }

  fun resetStaleProcessing(staleBefore: Long) {
    writableDatabase.execSQL(
      "UPDATE screenshot_metadata SET processing_status = 'Pending', processing_attempts = MAX(processing_attempts - 1, 0) WHERE processing_status = 'Processing' AND indexed_at = 0 AND updated_at < ?",
      arrayOf(staleBefore),
    )
  }

  /**
   * Final pipeline stage: metadata, OCR row and token index land in one transaction so a crash can
   * never leave a row marked Completed with a half-written index.
   */
  fun complete(image: PendingImage, intelligence: ImageIntelligenceResult) {
    val db = writableDatabase
    val now = System.currentTimeMillis()
    db.beginTransactionNonExclusive()
    try {
      val values = ContentValues().apply {
        put("thumbnail_path", intelligence.thumbnailPath)
        put("ocr_text", "")
        put("image_labels", intelligence.labels.joinToString(" "))
        put("category", intelligence.category)
        put("auto_tags", JSONArray(intelligence.tags).toString())
        put("category_confidence", intelligence.categoryConfidence)
        put("has_text", if (intelligence.ocr.text.isNotBlank()) 1 else 0)
        // The vector itself now lives in screenshot_embeddings; this column stays only because the
        // queue predicate reads the version, and SQLite before 3.35 cannot drop the other two.
        put("embedding_version", OfflineImageIntelligence.EMBEDDING_VERSION)
        put("embedding_dimensions", intelligence.embedding.size)
        put("processing_status", "Completed")
        put("ocr_status", "Completed")
        put("embedding_status", "Completed")
        put("indexed_at", now)
        putNull("processing_error")
        put("updated_at", now)
      }
      db.update("screenshot_metadata", values, "id = ?", arrayOf(image.id))

      db.insertWithOnConflict(
        "screenshot_embeddings", null,
        ContentValues().apply {
          put("screenshot_id", image.id)
          put("vector", encodeEmbedding(intelligence.embedding))
          put("dimensions", intelligence.embedding.size)
          put("model_version", OfflineImageIntelligence.EMBEDDING_VERSION)
          put("created_at", now)
        },
        SQLiteDatabase.CONFLICT_REPLACE,
      )

      db.insertWithOnConflict(
        "screenshot_ocr", null,
        ContentValues().apply {
          put("screenshot_id", image.id)
          put("extracted_text", intelligence.ocr.text)
          put("confidence", intelligence.ocr.confidence)
          put("language", intelligence.ocr.language)
          put("processed_at", now)
        },
        SQLiteDatabase.CONFLICT_REPLACE,
      )

      replaceTokens(db, image, intelligence)
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  /**
   * Token set is capped per image: a dense text screenshot would otherwise contribute thousands of
   * rows and dominate the index for no ranking benefit.
   *
   * The file name and folder are indexed alongside the recognized text. "WhatsApp Image 2024-06"
   * and "Pictures/Screenshots" carry as much intent as anything inside the image, and the cap
   * already bounds what this costs.
   */
  private fun replaceTokens(db: SQLiteDatabase, image: PendingImage, intelligence: ImageIntelligenceResult) {
    val id = image.id
    db.delete("screenshot_ocr_tokens", "screenshot_id = ?", arrayOf(id))
    val source = buildString {
      append(intelligence.ocr.text).append(' ')
      append(intelligence.labels.joinToString(" ")).append(' ')
      append(intelligence.tags.joinToString(" ")).append(' ')
      append(intelligence.category).append(' ')
      append(image.fileName).append(' ')
      append(image.relativePath.replace('/', ' '))
    }
    val counts = OfflineEmbedding.contentTokens(source).groupingBy { it }.eachCount()
    if (counts.isEmpty()) return
    val statement = db.compileStatement(
      "INSERT OR REPLACE INTO screenshot_ocr_tokens (token, screenshot_id, hits) VALUES (?, ?, ?)",
    )
    statement.use {
      counts.entries.sortedByDescending { it.value }.take(MAX_TOKENS_PER_IMAGE).forEach { (token, hits) ->
        it.clearBindings()
        it.bindString(1, token)
        it.bindString(2, id)
        it.bindLong(3, hits.toLong())
        it.executeInsert()
      }
    }
  }

  fun fail(id: String, message: String, retryable: Boolean) {
    val values = ContentValues().apply {
      put("processing_status", if (retryable) "Pending" else "Failed")
      put("ocr_status", "Failed")
      put("embedding_status", "Failed")
      put("processing_error", message.take(500))
      put("updated_at", System.currentTimeMillis())
      if (!retryable) put("processing_attempts", MAX_ATTEMPTS)
    }
    writableDatabase.update("screenshot_metadata", values, "id = ?", arrayOf(id))
  }

  fun hasPending(): Boolean = readableDatabase.rawQuery(
    "SELECT 1 FROM screenshot_metadata WHERE is_deleted = 0 AND (processing_status IN ('Pending', 'Failed') OR embedding_version != ?) AND processing_attempts < ? LIMIT 1",
    arrayOf(OfflineImageIntelligence.EMBEDDING_VERSION.toString(), MAX_ATTEMPTS.toString()),
  ).use { it.moveToFirst() }

  fun counts(): IndexCounts {
    val counts = mutableMapOf<String, Int>()
    readableDatabase.rawQuery(
      "SELECT processing_status, COUNT(*) FROM screenshot_metadata WHERE is_deleted = 0 GROUP BY processing_status",
      null,
    ).use { cursor -> while (cursor.moveToNext()) counts[cursor.getString(0)] = cursor.getInt(1) }
    return IndexCounts(counts["Pending"] ?: 0, counts["Processing"] ?: 0, counts["Completed"] ?: 0, counts["Failed"] ?: 0)
  }

  fun latestFailure(): IndexFailure? = readableDatabase.rawQuery(
    "SELECT processing_error FROM screenshot_metadata WHERE is_deleted = 0 AND processing_status = 'Failed' AND processing_error IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
    null,
  ).use { cursor ->
    if (!cursor.moveToFirst()) null else IndexFailure(cursor.getString(0))
  }

  fun findByUri(uri: String): SearchRow? = readableDatabase.rawQuery(
    "$SEARCH_COLUMNS WHERE m.media_store_uri = ? AND m.is_deleted = 0 LIMIT 1", arrayOf(uri),
  ).use { cursor -> if (cursor.moveToFirst()) cursor.toSearchRow() else null }

  /** Streams ranking rows without OCR text. A single text-heavy screenshot can exceed the 2 MB
   *  CursorWindow and crash the read; OCR is hydrated for the winning rows only. */
  fun streamIndexed(block: (SearchRow) -> Unit) {
    readableDatabase.rawQuery(
      "$STREAM_COLUMNS WHERE m.is_deleted = 0 AND m.embedding_status = 'Completed'", null,
    ).use { cursor -> while (cursor.moveToNext()) block(cursor.toSearchRow()) }
  }

  /** Bounded OCR snippets for the final result page only. */
  fun ocrSnippets(ids: List<String>): Map<String, OcrResult> {
    if (ids.isEmpty()) return emptyMap()
    val placeholders = ids.joinToString(",") { "?" }
    val snippets = mutableMapOf<String, OcrResult>()
    readableDatabase.rawQuery(
      "SELECT screenshot_id, SUBSTR(extracted_text, 1, $OCR_SNIPPET_CHARS), confidence, language FROM screenshot_ocr WHERE screenshot_id IN ($placeholders)",
      ids.toTypedArray(),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        snippets[cursor.getString(0)] = OcrResult(
          text = cursor.getString(1) ?: "",
          confidence = cursor.getFloat(2),
          language = cursor.getString(3) ?: "und",
        )
      }
    }
    return snippets
  }

  /**
   * Indexed lookup over the token table. Each query token becomes a half-open range scan on the
   * primary key, which also gives prefix matching ("bank" hits "banking") without a leading
   * wildcard — the pattern that forces a full scan.
   */
  fun lexicalMatches(tokens: List<String>, limit: Int): Map<String, Float> {
    if (tokens.isEmpty()) return emptyMap()
    val ranges = tokens.joinToString(" OR ") { "(token >= ? AND token < ?)" }
    val args = tokens.flatMap { listOf(it, it + PREFIX_UPPER_BOUND) } + limit.toString()
    val scores = mutableMapOf<String, Float>()
    var maxScore = 0f
    readableDatabase.rawQuery(
      """
      SELECT screenshot_id, SUM(hits) AS score, COUNT(DISTINCT token) AS matched
      FROM screenshot_ocr_tokens
      WHERE $ranges
      GROUP BY screenshot_id
      ORDER BY matched DESC, score DESC
      LIMIT ?
      """.trimIndent(),
      args.toTypedArray(),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        // Coverage dominates raw frequency: matching every query term beats repeating one of them.
        val coverage = cursor.getInt(2).toFloat() / tokens.size
        val score = coverage * (1f + cursor.getInt(1).toFloat() / FREQUENCY_DAMPING)
        scores[cursor.getString(0)] = score
        if (score > maxScore) maxScore = score
      }
    }
    return if (maxScore <= 0f) scores else scores.mapValues { (_, score) -> score / maxScore }
  }

  /**
   * Which indexed terms each of the given screenshots actually carries, so a result can show why it
   * ranked. Restricted to the result page, so the id list stays far below the parameter ceiling.
   * The stored token is returned rather than the query term: prefix matching means the user typed
   * "bank" and the image contains "banking", and the longer form is the more useful answer.
   */
  fun matchedTokens(ids: List<String>, tokens: List<String>): Map<String, List<String>> {
    if (ids.isEmpty() || tokens.isEmpty()) return emptyMap()
    val ranges = tokens.joinToString(" OR ") { "(token >= ? AND token < ?)" }
    val idPlaceholders = ids.joinToString(",") { "?" }
    val args = tokens.flatMap { listOf(it, it + PREFIX_UPPER_BOUND) } + ids
    val matches = mutableMapOf<String, MutableList<String>>()
    readableDatabase.rawQuery(
      """
      SELECT screenshot_id, token
      FROM screenshot_ocr_tokens
      WHERE ($ranges) AND screenshot_id IN ($idPlaceholders)
      ORDER BY hits DESC
      """.trimIndent(),
      args.toTypedArray(),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val terms = matches.getOrPut(cursor.getString(0)) { mutableListOf() }
        if (terms.size < MAX_MATCHED_TERMS) terms += cursor.getString(1)
      }
    }
    return matches
  }

  /**
   * Indexed rows that the user has not filed into any collection — the pool the suggestion engine
   * clusters. `screenshot_collections` is created by the JS migrations, so on a native-first launch
   * it may not exist yet; in that case nothing is filed and every row qualifies.
   */
  fun streamUnfiled(limit: Int, block: (SearchRow) -> Unit) {
    val db = readableDatabase
    val unfiled = if (hasTable(db, "screenshot_collections")) {
      " AND NOT EXISTS (SELECT 1 FROM screenshot_collections sc WHERE sc.screenshot_id = m.id)"
    } else {
      ""
    }
    db.rawQuery(
      "$STREAM_COLUMNS WHERE m.is_deleted = 0 AND m.embedding_status = 'Completed'$unfiled " +
        "ORDER BY m.date_created DESC, m.id LIMIT ?",
      arrayOf(limit.toString()),
    ).use { cursor -> while (cursor.moveToNext()) block(cursor.toSearchRow()) }
  }

  /** For the given screenshots: token -> how many of them contain it. */
  fun tokenDocumentCounts(ids: List<String>): Map<String, Int> = countTokens(ids, "screenshot_id")

  /** Across the whole library: token -> how many screenshots contain it. Drives the IDF term. */
  fun globalDocumentFrequency(tokens: Collection<String>): Map<String, Int> = countTokens(tokens.toList(), "token")

  /** Library size for IDF. Counting completed rows avoids a distinct scan of the token index. */
  fun indexedDocumentCount(): Int = readableDatabase.rawQuery(
    "SELECT COUNT(*) FROM screenshot_metadata WHERE is_deleted = 0 AND processing_status = 'Completed'", null,
  ).use { if (it.moveToFirst()) it.getInt(0) else 0 }

  /** Chunked so a large cluster never exceeds SQLite's bound-parameter limit. */
  private fun countTokens(values: List<String>, column: String): Map<String, Int> {
    if (values.isEmpty()) return emptyMap()
    val counts = mutableMapOf<String, Int>()
    values.distinct().chunked(SQL_PARAMETER_CHUNK).forEach { chunk ->
      val placeholders = chunk.joinToString(",") { "?" }
      readableDatabase.rawQuery(
        "SELECT token, COUNT(*) FROM screenshot_ocr_tokens WHERE $column IN ($placeholders) GROUP BY token",
        chunk.toTypedArray(),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          val token = cursor.getString(0)
          counts[token] = (counts[token] ?: 0) + cursor.getInt(1)
        }
      }
    }
    return counts
  }

  private fun hasTable(db: SQLiteDatabase, name: String): Boolean = db.rawQuery(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", arrayOf(name),
  ).use { it.moveToFirst() }

  /**
   * Removes one image from the index after the platform has confirmed the file itself is gone.
   * Called only on a successful MediaStore delete: a row removed while the file survives would be
   * silently re-added by the next scan, which would read as the delete having failed.
   *
   * The derived rows are deleted explicitly rather than left to the embedding table's cascade, since
   * OCR and tokens carry no foreign key of their own.
   */
  fun purgeImage(id: String) {
    val db = writableDatabase
    db.beginTransactionNonExclusive()
    try {
      db.delete("screenshot_ocr_tokens", "screenshot_id = ?", arrayOf(id))
      db.delete("screenshot_embeddings", "screenshot_id = ?", arrayOf(id))
      db.delete("screenshot_ocr", "screenshot_id = ?", arrayOf(id))
      if (hasTable(db, "screenshot_collections")) {
        db.delete("screenshot_collections", "screenshot_id = ?", arrayOf(id))
      }
      db.delete("screenshot_metadata", "id = ?", arrayOf(id))
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  /**
   * Drops everything the AI derived — recognized text, vectors, tokens, labels and categories — and
   * re-queues every image so the pipeline can rebuild it.
   *
   * The images themselves and the categories the user filed them into are untouched: this is the
   * "forget what you inferred" control, not a delete. Rows return to Pending rather than being
   * removed so the library stays browsable while the index refills.
   */
  fun clearDerivedData() {
    val db = writableDatabase
    db.beginTransactionNonExclusive()
    try {
      db.delete("screenshot_ocr_tokens", null, null)
      db.delete("screenshot_embeddings", null, null)
      db.delete("screenshot_ocr", null, null)
      db.execSQL(
        """
        UPDATE screenshot_metadata SET
          processing_status = 'Pending', ocr_status = 'Pending', embedding_status = 'Pending',
          processing_attempts = 0, processing_error = NULL, indexed_at = 0,
          ocr_text = '', image_labels = '', auto_tags = '[]', has_text = 0,
          category = ?, category_confidence = 0,
          embedding_vector = NULL, embedding_version = 0, embedding_dimensions = 0,
          updated_at = ?
        WHERE is_deleted = 0
        """.trimIndent(),
        arrayOf(ScreenshotCategorizer.OTHER, System.currentTimeMillis()),
      )
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  /**
   * Drops every Recall table, including the ones the JS migrations own. The next `ensureSchema`
   * recreates the native side and the JS migration runner recreates its own, so the app comes back
   * up empty rather than broken.
   */
  fun wipe() {
    val db = writableDatabase
    db.beginTransactionNonExclusive()
    try {
      WIPED_TABLES.forEach { table -> db.execSQL("DROP TABLE IF EXISTS $table") }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
    ensureSchema(db)
  }

  /** Indexed image count per top-level folder, so Settings can show real numbers per location. */
  fun folderCounts(): Map<String, Int> {
    val counts = mutableMapOf<String, Int>()
    readableDatabase.rawQuery(
      "SELECT relative_path, COUNT(*) FROM screenshot_metadata WHERE is_deleted = 0 GROUP BY relative_path",
      null,
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val root = (cursor.getString(0) ?: "").trim('/').substringBefore('/').ifBlank { "Device" }
        counts[root] = (counts[root] ?: 0) + cursor.getInt(1)
      }
    }
    return counts
  }

  /** Row counts and on-disk size of the index itself — not of the images, which Recall never copies. */
  fun storageFootprint(): StorageFootprint {
    val db = readableDatabase
    fun count(sql: String) = db.rawQuery(sql, null).use { if (it.moveToFirst()) it.getLong(0) else 0L }
    val databaseBytes = File(db.path).let { file ->
      // WAL and shared-memory siblings are part of what the database occupies on disk.
      file.length() + File("${file.path}-wal").length() + File("${file.path}-shm").length()
    }
    return StorageFootprint(
      databaseBytes = databaseBytes,
      indexedImages = count("SELECT COUNT(*) FROM screenshot_metadata WHERE is_deleted = 0"),
      ocrRecords = count("SELECT COUNT(*) FROM screenshot_ocr"),
      embeddings = count("SELECT COUNT(*) FROM screenshot_embeddings"),
      tokens = count("SELECT COUNT(*) FROM screenshot_ocr_tokens"),
    )
  }

  private fun Cursor.toSearchRow() = SearchRow(
    id = getString(0),
    uri = getString(1),
    fileName = getString(2),
    thumbnailPath = if (isNull(3)) null else getString(3),
    ocrText = getString(4) ?: "",
    category = getString(5) ?: ScreenshotCategorizer.OTHER,
    tags = decodeTags(if (isNull(14)) null else getString(14)),
    categoryConfidence = getFloat(15),
    ocrConfidence = getFloat(16),
    ocrLanguage = getString(17) ?: "und",
    embedding = if (isNull(6)) null else decodeEmbedding(getBlob(6)),
    createdAt = getLong(7),
    modifiedAt = getLong(8),
    size = getLong(9),
    width = getInt(10),
    height = getInt(11),
    mimeType = getString(12) ?: "image/*",
    relativePath = getString(13) ?: "",
    viewCount = getInt(18),
    searchCount = getInt(19),
    hasText = getInt(20) == 1,
  )

  private data class ExistingImage(val modifiedAt: Long, val size: Long, val embeddingVersion: Int, val isActive: Boolean)

  companion object {
    const val DATABASE_NAME = "recall_ai.db"
    private const val DATABASE_VERSION = 1
    private const val MAX_ATTEMPTS = 3
    private const val OCR_SNIPPET_CHARS = 2000
    private const val MAX_TOKENS_PER_IMAGE = 220
    private const val FREQUENCY_DAMPING = 12f

    /** Enough to explain a result in a line of UI; more would not fit anyway. */
    private const val MAX_MATCHED_TERMS = 4

    /** Well under SQLite's default 999 bound-parameter ceiling. */
    private const val SQL_PARAMETER_CHUNK = 400

    /**
     * Every table Recall owns, native and JS alike, ordered so a child is dropped before its parent.
     * The JS-owned collection tables are listed here too: "delete database" has to mean the whole
     * database, and a half-dropped schema is worse than either extreme.
     */
    private val WIPED_TABLES = listOf(
      "screenshot_ocr_tokens", "screenshot_embeddings", "screenshot_ocr",
      "screenshot_collections", "screenshot_tags", "favorites", "user_notes",
      "user_collections", "user_tags", "search_history", "app_settings",
      "screenshot_metadata", "schema_migrations",
    )

    /** Highest code point, so `token < prefix + this` bounds a prefix range without a wildcard. */
    private const val PREFIX_UPPER_BOUND = "￿"

    private const val BASE_COLUMNS =
      "m.id, m.media_store_uri, m.file_name, m.thumbnail_path, %s, m.category, e.vector, " +
        "m.date_created, m.date_modified, m.file_size, m.width, m.height, m.mime_type, m.relative_path, " +
        "m.auto_tags, m.category_confidence, %s, %s, m.view_count, m.search_count, m.has_text"

    private val SEARCH_COLUMNS = "SELECT " +
      BASE_COLUMNS.format(
        "SUBSTR(COALESCE(o.extracted_text, ''), 1, $OCR_SNIPPET_CHARS)",
        "COALESCE(o.confidence, 0)",
        "COALESCE(o.language, 'und')",
      ) + " FROM screenshot_metadata m LEFT JOIN screenshot_ocr o ON o.screenshot_id = m.id" +
      " LEFT JOIN screenshot_embeddings e ON e.screenshot_id = m.id"

    /** Same column order as SEARCH_COLUMNS so toSearchRow indices are shared. The OCR join is
     *  dropped entirely: ranking never reads text, and skipping it keeps the scan index-only.
     *  The embedding join is inner — a row without a vector cannot be ranked. */
    private val STREAM_COLUMNS = "SELECT " +
      BASE_COLUMNS.format("''", "0", "'und'") +
      " FROM screenshot_metadata m JOIN screenshot_embeddings e ON e.screenshot_id = m.id"

    private val REQUIRED_COLUMNS = linkedMapOf(
      "is_deleted" to "INTEGER NOT NULL DEFAULT 0", "last_seen_scan_id" to "TEXT", "embedding_vector" to "BLOB",
      "embedding_version" to "INTEGER NOT NULL DEFAULT 0", "embedding_dimensions" to "INTEGER NOT NULL DEFAULT 0",
      "image_labels" to "TEXT NOT NULL DEFAULT ''", "auto_tags" to "TEXT NOT NULL DEFAULT '[]'",
      "category_confidence" to "REAL NOT NULL DEFAULT 0", "processing_attempts" to "INTEGER NOT NULL DEFAULT 0",
      "processing_error" to "TEXT", "indexed_at" to "INTEGER NOT NULL DEFAULT 0",
      "updated_at" to "INTEGER NOT NULL DEFAULT 0", "relative_path" to "TEXT",
      "thumbnail_path" to "TEXT", "ocr_text" to "TEXT NOT NULL DEFAULT ''",
      "category" to "TEXT NOT NULL DEFAULT 'Other'", "mime_type" to "TEXT NOT NULL DEFAULT 'image/*'",
      /**
       * Whether recognized text was found, denormalised onto the metadata row. The ranking scan
       * deliberately does not join screenshot_ocr — that join is what would make it read text — so a
       * "has text" filter has no other way to see this without undoing that.
       */
      "has_text" to "INTEGER NOT NULL DEFAULT 0",
    )

    fun decodeTags(json: String?): List<String> {
      if (json.isNullOrBlank()) return emptyList()
      return runCatching {
        val array = JSONArray(json)
        (0 until array.length()).mapNotNull { array.optString(it).takeIf(String::isNotBlank) }
      }.getOrDefault(emptyList())
    }

    fun encodeEmbedding(values: FloatArray): ByteArray = ByteBuffer.allocate(values.size * 4)
      .order(ByteOrder.LITTLE_ENDIAN).also { buffer -> values.forEach(buffer::putFloat) }.array()

    fun decodeEmbedding(bytes: ByteArray): FloatArray {
      val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
      return FloatArray(bytes.size / 4) { buffer.float }
    }
  }
}

