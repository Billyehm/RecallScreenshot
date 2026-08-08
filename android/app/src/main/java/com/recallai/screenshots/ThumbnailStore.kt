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
   * Oldest-first eviction once the cache passes the cap. Called once per worker batch instead of
   * once per image: a single walk of the shard tree rather than one listing per thumbnail written.
   */
  fun prune(): Long {
    val files = root.listFiles()?.flatMap { shard ->
      if (shard.isDirectory) shard.listFiles()?.toList() ?: emptyList() else listOf(shard)
    } ?: return 0L
    var total = files.sumOf { it.length() }
    if (total <= MAX_CACHE_BYTES) return total
    for (file in files.sortedBy { it.lastModified() }) {
      if (total <= MAX_CACHE_BYTES) break
      val size = file.length()
      if (file.delete()) total -= size
    }
    return total
  }

  private fun shardFor(id: String): File =
    File(root, "%02x".format(id.hashCode() and 0xFF)).also { it.mkdirs() }

  companion object {
    private const val DIRECTORY = "recall_thumbnails"
    private const val EDGE = 384
    private const val QUALITY = 78
    private const val MAX_CACHE_BYTES = 96L * 1024 * 1024
  }
}
