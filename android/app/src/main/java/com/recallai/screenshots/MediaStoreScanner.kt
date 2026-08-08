package com.recallai.screenshots

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.os.Build
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import java.util.UUID

data class IndexedImage(
  val id: String,
  val uri: String,
  val fileName: String,
  val relativePath: String,
  val mimeType: String,
  val createdAt: Long,
  val modifiedAt: Long,
  val size: Long,
  val width: Int,
  val height: Int,
)

data class ScanSummary(val scanId: String, val discovered: Int, val queued: Int, val deleted: Int)

class MediaStoreScanner(private val context: Context) {
  /**
   * Streams MediaStore rows straight into SQLite so a 10k library is never retained in RAM.
   *
   * Commits every [CHUNK_SIZE] rows rather than wrapping the whole library in one transaction:
   * batching removes the per-row fsync that made a 10k scan take minutes, while still releasing the
   * writer lock often enough that concurrent JS reads never wait on a library-long transaction.
   */
  fun scanIntoStore(store: RecallIndexStore, allowDeletion: Boolean): ScanSummary {
    val scanId = UUID.randomUUID().toString()
    var discovered = 0
    var queued = 0
    var chunkRows = 0
    var open = false
    try {
      query()?.use { cursor ->
        while (cursor.moveToNext()) {
          val row = cursor.toScannableImage()
          if (!isSupportedLocation(row.image.relativePath, row.bucket, row.image.fileName)) continue
          if (!open) {
            store.beginScanChunk()
            open = true
          }
          discovered += 1
          if (store.upsertDiscovered(row.image, scanId)) queued += 1
          if (++chunkRows >= CHUNK_SIZE) {
            store.commitScanChunk()
            open = false
            chunkRows = 0
          }
        }
      }
      if (open) {
        store.commitScanChunk()
        open = false
      }
    } catch (error: Throwable) {
      if (open) store.rollbackScanChunk()
      throw error
    }
    val deleted = store.finishScan(scanId, allowDeletion)
    return ScanSummary(scanId, discovered, queued, deleted)
  }

  fun queryPage(limit: Int, offset: Int): List<IndexedImage> {
    val result = ArrayList<IndexedImage>(limit.coerceAtLeast(0))
    var matched = 0
    query()?.use { cursor ->
      while (cursor.moveToNext() && result.size < limit.coerceAtLeast(0)) {
        val row = cursor.toScannableImage()
        if (!isSupportedLocation(row.image.relativePath, row.bucket, row.image.fileName)) continue
        val image = row.image
        if (matched++ >= offset.coerceAtLeast(0)) result += image
      }
    }
    return result
  }

  private fun query(): Cursor? = context.contentResolver.query(
    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection(),
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) "${MediaStore.Images.Media.IS_PENDING} = 0" else null,
    null, "${MediaStore.Images.Media.DATE_MODIFIED} DESC",
  )

  private fun Cursor.toScannableImage(): ScannableImage {
    val id = getLong(getColumnIndexOrThrow(MediaStore.Images.Media._ID))
    val bucket = string(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
    val relativePath = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) string(MediaStore.Images.Media.RELATIVE_PATH) else bucket
    return ScannableImage(IndexedImage(
      id.toString(), ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id).toString(),
      string(MediaStore.Images.Media.DISPLAY_NAME).ifBlank { "Image" }, relativePath.ifBlank { bucket },
      string(MediaStore.Images.Media.MIME_TYPE).ifBlank { "image/*" },
      getLong(getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)) * 1_000L,
      getLong(getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED)) * 1_000L,
      getLong(getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)), getInt(getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)),
      getInt(getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)),
    ), bucket)
  }

  private fun Cursor.string(column: String): String {
    val index = getColumnIndex(column)
    return if (index < 0 || isNull(index)) "" else getString(index).orEmpty()
  }

  private fun projection() = buildList {
    add(MediaStore.Images.Media._ID); add(MediaStore.Images.Media.DISPLAY_NAME)
    add(MediaStore.Images.Media.DATE_ADDED); add(MediaStore.Images.Media.DATE_MODIFIED)
    add(MediaStore.Images.Media.SIZE); add(MediaStore.Images.Media.WIDTH); add(MediaStore.Images.Media.HEIGHT)
    add(MediaStore.Images.Media.MIME_TYPE); add(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) add(MediaStore.Images.Media.RELATIVE_PATH)
  }.toTypedArray()

  companion object {
    private const val CHUNK_SIZE = 400

    fun hasFullLibraryAccess(context: Context): Boolean {
      val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.READ_MEDIA_IMAGES
      else Manifest.permission.READ_EXTERNAL_STORAGE
      return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    fun isSupportedLocation(relativePath: String, bucket: String, fileName: String): Boolean {
      val location = "$relativePath/$bucket".lowercase()
      val name = fileName.lowercase()
      return listOf("dcim", "pictures", "screenshot", "download").any(location::contains) ||
        listOf("screenshot", "screen_shot", "screen-shot", "screen capture").any(name::contains)
    }
  }

  private data class ScannableImage(val image: IndexedImage, val bucket: String)
}