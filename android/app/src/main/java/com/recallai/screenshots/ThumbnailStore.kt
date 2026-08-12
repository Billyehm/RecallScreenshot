package com.recallai.screenshots

import android.content.Context
import android.graphics.Bitmap
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max

/**
 * Sharded JPEG thumbnail cache. Files sit two levels deep so no single directory grows to library
 * size, and each name carries the source mtime so a re-captured image can never serve a stale file.
 */
class ThumbnailStore(context: Context) {
  private val root = File(context.cacheDir, DIRECTORY)

  /**
   * Scales down from the already-decoded working bitmap rather than re-reading the original: the
   * pipeline decodes each image exactly once for OCR, labelling and the thumbnail together.
   */
  fun write(id: String, modifiedAt: Long, source: Bitmap, previousPath: String?): String {
    val scale = minOf(1f, EDGE.toFloat() / max(source.width, source.height))
    val width = max(1, (source.width * scale).toInt())
    val height = max(1, (source.height * scale).toInt())
    val scaled = if (width == source.width && height == source.height) {
      source
    } else {
      Bitmap.createScaledBitmap(source, width, height, true)
    }
    val file = File(shardFor(id), "${id}_$modifiedAt.jpg")
    try {
      FileOutputStream(file).use { scaled.compress(Bitmap.CompressFormat.JPEG, QUALITY, it) }
    } finally {
      if (scaled !== source) scaled.recycle()
    }
    if (previousPath != null && previousPath != file.absolutePath) File(previousPath).delete()
    return file.absolutePath
  }

  /** cacheDir is reclaimable by the platform, so a path recorded in SQLite can vanish under us. */
  fun isMissing(path: String?): Boolean = path.isNullOrBlank() || !File(path).exists()

  /**
   * Evicts once the cache passes the cap, dropping the oldest *images* first.
   *
   * Ordering by image capture time rather than file mtime is deliberate. The pipeline indexes
   * newest-first, so the newest images are the ones whose thumbnail files were written earliest —
   * evicting by file mtime therefore discarded exactly the thumbnails the worker's repair pass
   * scans for (the newest 240 rows), and the two ground against each other indefinitely on any
   * library past the cap. Capture time is already in the filename, so this costs no extra stat.
   *
   * Called once per worker batch instead of once per image: a single walk of the shard tree rather
   * than one listing per thumbnail written.
   */
  fun prune(): Long {
    val files = files() ?: return 0L
    var total = files.sumOf { it.length() }
    if (total <= MAX_CACHE_BYTES) return total
    for (file in files.sortedBy(::capturedAt)) {
      if (total <= MAX_CACHE_BYTES) break
      val size = file.length()
      if (file.delete()) total -= size
    }
    return total
  }

  /** Bytes the thumbnail cache currently occupies, for the storage breakdown in Settings. */
  fun totalBytes(): Long = files()?.sumOf { it.length() } ?: 0L

  /**
   * Drops every cached thumbnail. The rows that referenced them keep their recorded path, which the
   * worker's existing repair pass already treats as a reclaimed cache entry and regenerates.
   */
  fun clear(): Int {
    val files = files() ?: return 0
    return files.count(File::delete)
  }

  /** One walk of the shard tree, shared by pruning, sizing and clearing. */
  private fun files(): List<File>? = root.listFiles()?.flatMap { shard ->
    if (shard.isDirectory) shard.listFiles()?.toList() ?: emptyList() else listOf(shard)
  }

  private fun shardFor(id: String): File =
    File(root, "%02x".format(id.hashCode() and 0xFF)).also { it.mkdirs() }

  /**
   * Source mtime encoded in "${id}_$modifiedAt.jpg" by [write]. Falls back to the file's own mtime
   * for anything that does not parse, so a stray file still sorts rather than blocking eviction.
   */
  private fun capturedAt(file: File): Long =
    file.name.substringAfterLast('_').substringBeforeLast('.').toLongOrNull() ?: file.lastModified()

  companion object {
    private const val DIRECTORY = "recall_thumbnails"
    private const val EDGE = 384
    private const val QUALITY = 78
    private const val MAX_CACHE_BYTES = 96L * 1024 * 1024
  }
}
