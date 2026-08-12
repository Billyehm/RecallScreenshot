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

/** A device folder the user can bring into or out of indexing scope, with how many images it holds. */
data class MediaFolder(val name: String, val imageCount: Int, val isIndexed: Boolean)

class MediaStoreScanner(private val context: Context) {
  /**
   * Read once per scanner rather than per row: a 10k library would otherwise hit SharedPreferences
   * ten thousand times, and the scope cannot change mid-scan anyway.
   */
  private val scope by lazy { RecallIndexPreferences.indexScope(context) }
  private val allowedFolders by lazy { RecallIndexPreferences.indexedFolders(context) }
  private val hasFolderRestriction by lazy { RecallIndexPreferences.hasChosenFolders(context) }

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
          if (!isInScope(row)) continue
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
        if (!isInScope(row)) continue
        val image = row.image
        if (matched++ >= offset.coerceAtLeast(0)) result += image
      }
    }
    return result
  }

  /**
   * Every folder that holds images, with the count and whether it is currently indexed. Drives the
   * folder picker in Settings, so it lists what the device actually has rather than a fixed set.
   */
  fun listFolders(): List<MediaFolder> {
    val counts = LinkedHashMap<String, Int>()
    query()?.use { cursor ->
      while (cursor.moveToNext()) {
        val row = cursor.toScannableImage()
        val name = folderName(row)
        if (name.isNotBlank()) counts[name] = (counts[name] ?: 0) + 1
      }
    }
    return counts.entries
      // Through the same gate the scan uses, so the picker cannot claim a folder is in scope when a
      // scan would skip it. Only the folder axis applies here: the picker chooses where to look, not
      // what counts once Recall looks there.
      .map { (name, count) -> MediaFolder(name, count, inFolderScope(name)) }
      .sortedByDescending(MediaFolder::imageCount)
  }

  /**
   * A row is in scope when both gates admit it: its folder is one Recall may read, and its kind is
   * one the user asked for. The gates are deliberately independent — narrowing folders should not
   * change what counts as a screenshot, and widening to all images should not change where Recall
   * looks.
   */
  private fun isInScope(row: ScannableImage): Boolean =
    inFolderScope("${row.image.relativePath}/${row.bucket}") &&
      matchesScope(row.image.relativePath, row.bucket, row.image.fileName, scope)

  /**
   * Until the user picks folders there is no folder restriction at all — [RecallIndexPreferences.IndexScope]
   * is what keeps a fresh install from reading the whole library. Once they have picked, their choice
   * is absolute, and a deliberately empty selection indexes nothing.
   */
  private fun inFolderScope(location: String): Boolean {
    if (!hasFolderRestriction) return true
    val lowered = location.lowercase()
    return allowedFolders.any(lowered::contains)
  }

  /** Prefers the first path segment so the picker shows "Pictures" rather than "Pictures/Foo/Bar". */
  private fun folderName(row: ScannableImage): String {
    val root = row.image.relativePath.trim('/').substringBefore('/')
    return root.ifBlank { row.bucket }
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

    /**
     * Whether an image is the kind [scope] asks for. The folder gate is the caller's business, so
     * ALL_IMAGES admits every row here and narrowing by folder stays a separate decision.
     */
    fun matchesScope(
      relativePath: String,
      bucket: String,
      fileName: String,
      scope: RecallIndexPreferences.IndexScope,
    ): Boolean {
      if (scope == RecallIndexPreferences.IndexScope.ALL_IMAGES) return true
      return isScreenshot("$relativePath/$bucket", fileName)
    }

    /**
     * Matches the folder and the file name together, because either alone misses real captures: a
     * vendor tool may write to DCIM but name the file "Screenshot_…", and a gallery app may rename a
     * file to something plain while leaving it in Screenshots/.
     */
    private fun isScreenshot(location: String, fileName: String): Boolean {
      val haystack = "$location/$fileName".lowercase()
      return SCREENSHOT_MARKERS.any(haystack::contains)
    }

    /** Shapes the common screenshot tools produce, in the folder they write to or the name they give. */
    private val SCREENSHOT_MARKERS = listOf("screenshot", "screen_shot", "screen-shot", "screen capture")
  }

  private data class ScannableImage(val image: IndexedImage, val bucket: String)
}