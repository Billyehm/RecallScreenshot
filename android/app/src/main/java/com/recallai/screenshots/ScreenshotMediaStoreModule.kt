package com.recallai.screenshots

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

class ScreenshotMediaStoreModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  private val store by lazy { RecallIndexStore(context).also(RecallIndexStore::ensureReady) }
  private val searchEngine by lazy { OfflineSearchEngine(context, store) }
  private val suggestionEngine by lazy { CollectionSuggestionEngine(store) }
  private var observer: ContentObserver? = null

  /** The delete the OS is currently confirming with the user, held until its result comes back. */
  private var pendingDelete: PendingDelete? = null

  private val activityListener = object : ActivityEventListener {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != DELETE_REQUEST) return
      val pending = pendingDelete ?: return
      pendingDelete = null
      if (resultCode == Activity.RESULT_OK) {
        // Only now are the files actually gone, so only now may the index forget them.
        executor.execute {
          pending.ids.forEach { id -> runCatching { store.purgeImage(id) } }
          pending.promise.resolve(true)
        }
      } else {
        // The user declined the system dialog. Not an error — the image simply stays.
        pending.promise.resolve(false)
      }
    }

    override fun onNewIntent(intent: Intent) = Unit
  }

  init {
    context.addActivityEventListener(activityListener)
  }

  override fun getName() = "ScreenshotMediaStore"

  @ReactMethod
  fun queryImages(limit: Int, offset: Int, promise: Promise) = onBackground(promise) {
    Arguments.createArray().also { array ->
      MediaStoreScanner(context).queryPage(limit.coerceIn(0, 200), offset).forEach { image ->
        array.pushMap(Arguments.createMap().apply {
          putString("id", image.id); putString("title", image.fileName.substringBeforeLast('.'))
          putString("source", source(image.relativePath)); putString("uri", image.uri); putString("fileName", image.fileName)
          putDouble("createdAt", image.createdAt.toDouble()); putDouble("modifiedAt", image.modifiedAt.toDouble())
          putDouble("size", image.size.toDouble()); putInt("width", image.width); putInt("height", image.height)
          putString("mimeType", image.mimeType)
        })
      }
    }
  }

  @ReactMethod
  fun getSha256(contentUri: String, promise: Promise) = onBackground(promise) {
    val digest = MessageDigest.getInstance("SHA-256")
    context.contentResolver.openInputStream(Uri.parse(contentUri)).use { input ->
      requireNotNull(input) { "Unable to open image URI" }
      val buffer = ByteArray(64 * 1024)
      while (true) { val read = input.read(buffer); if (read < 0) break else digest.update(buffer, 0, read) }
    }
    digest.digest().joinToString("") { "%02x".format(it) }
  }

  @ReactMethod fun startIndexing(promise: Promise) { RecallIndexScheduler.start(context); promise.resolve(null) }
  @ReactMethod fun pauseIndexing(promise: Promise) { RecallIndexScheduler.pause(context); promise.resolve(null) }
  @ReactMethod fun resumeIndexing(promise: Promise) { RecallIndexScheduler.resume(context); promise.resolve(null) }

  @ReactMethod
  fun getIndexStatus(promise: Promise) = onBackground(promise) {
    val counts = store.counts()
    Arguments.createMap().apply {
      putString("state", when {
        RecallIndexScheduler.isPaused(context) -> "paused"
        counts.processing > 0 || counts.pending > 0 -> "running"
        else -> "idle"
      })
      putInt("discovered", counts.pending + counts.processing + counts.completed + counts.failed)
      putInt("pending", counts.pending); putInt("processing", counts.processing)
      putInt("completed", counts.completed); putInt("failed", counts.failed)
    }
  }

  /**
   * [filters] narrows the scan: category, date window, has-text and folder. Empty means no filter.
   */
  @ReactMethod
  fun searchText(query: String, filters: ReadableMap?, limit: Int, promise: Promise) = onBackground(promise) {
    searchResults(searchEngine.searchText(query, limit.coerceIn(1, MAX_RESULTS), filters.toSearchFilters()))
  }

  private fun ReadableMap?.toSearchFilters(): SearchFilters {
    if (this == null) return SearchFilters.NONE
    fun millis(key: String) = if (hasKey(key) && !isNull(key)) getDouble(key).toLong() else 0L
    fun text(key: String) = if (hasKey(key) && !isNull(key)) getString(key).orEmpty() else ""
    return SearchFilters(
      category = text("category"),
      fromMillis = millis("fromMillis"),
      toMillis = millis("toMillis"),
      hasText = hasKey("hasText") && !isNull("hasText") && getBoolean("hasText"),
      folder = text("folder"),
    )
  }

  @ReactMethod
  fun searchSimilar(contentUri: String, limit: Int, promise: Promise) = onBackground(promise) {
    searchResults(searchEngine.searchSimilar(contentUri, limit.coerceIn(1, MAX_RESULTS)))
  }

  /** Clusters of unfiled screenshots the user could turn into a collection. Names and thumbnails
   *  are derived from the images themselves — nothing here is a fixed label. */
  @ReactMethod
  fun suggestCollections(limit: Int, promise: Promise) = onBackground(promise) {
    Arguments.createArray().also { array ->
      suggestionEngine.suggest(limit.coerceIn(1, MAX_SUGGESTIONS)).forEach { suggestion ->
        array.pushMap(Arguments.createMap().apply {
          putString("id", suggestion.id); putString("name", suggestion.name)
          putArray("keywords", strings(suggestion.keywords)); putArray("memberIds", strings(suggestion.memberIds))
          putInt("size", suggestion.memberIds.size); putDouble("cohesion", suggestion.cohesion.toDouble())
          putString("category", suggestion.dominantCategory)
          putString("representativeId", suggestion.representativeId)
          putString("representativeUri", suggestion.representativeUri)
          putString(
            "representativeThumbnailUri",
            suggestion.representativeThumbnailPath?.let { Uri.fromFile(File(it)).toString() },
          )
        })
      }
    }
  }

  /**
   * Deletes the underlying image. On API 30+ the platform owns the confirmation: `createDeleteRequest`
   * shows a system dialog the app cannot suppress or pre-answer, and the result arrives on
   * [activityListener]. Resolves true when the file was deleted, false when the user declined.
   *
   * The index row is purged only after a confirmed delete — dropping it first would let the next scan
   * rediscover a file that never went away, which reads as the delete having silently failed.
   */
  @ReactMethod
  fun deleteImage(contentUri: String, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject(ERROR_CODE, "No foreground activity to confirm the delete")
      return
    }
    if (pendingDelete != null) {
      promise.reject(ERROR_CODE, "Another delete is already awaiting confirmation")
      return
    }

    val uri = runCatching { Uri.parse(contentUri) }.getOrNull()
    if (uri == null) {
      promise.reject(ERROR_CODE, "Unrecognised image URI")
      return
    }
    val id = uri.lastPathSegment.orEmpty()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        pendingDelete = PendingDelete(listOf(id), promise)
        val request = MediaStore.createDeleteRequest(context.contentResolver, listOf(uri))
        activity.startIntentSenderForResult(request.intentSender, DELETE_REQUEST, null, 0, 0, 0)
      } else {
        // No system delete dialog before API 30. The caller is responsible for confirming, and the
        // write permission this needs is declared with maxSdkVersion="29" for exactly this path.
        if (!hasLegacyWriteAccess()) {
          promise.reject(ERROR_CODE, "Storage permission is required to delete on this Android version")
          return
        }
        val removed = context.contentResolver.delete(uri, null, null)
        executor.execute {
          if (removed > 0) runCatching { store.purgeImage(id) }
          promise.resolve(removed > 0)
        }
      }
    } catch (error: Throwable) {
      pendingDelete = null
      promise.reject(ERROR_CODE, error.message, error)
    }
  }

  /**
   * Deletes several images behind a single confirmation.
   *
   * `createDeleteRequest` accepts the whole list, so API 30+ raises one system dialog for the
   * selection rather than one per image — calling [deleteImage] in a loop would prompt N times and,
   * because only one delete may await confirmation, reject every request after the first.
   *
   * Below API 30 there is no system dialog, so the rows are deleted directly and the result is the
   * count that actually went away.
   */
  @ReactMethod
  fun deleteImages(contentUris: com.facebook.react.bridge.ReadableArray, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject(ERROR_CODE, "No foreground activity to confirm the delete")
      return
    }
    if (pendingDelete != null) {
      promise.reject(ERROR_CODE, "Another delete is already awaiting confirmation")
      return
    }

    val uris = (0 until contentUris.size()).mapNotNull { index ->
      contentUris.getString(index)?.let { runCatching { Uri.parse(it) }.getOrNull() }
    }
    if (uris.isEmpty()) {
      promise.reject(ERROR_CODE, "No recognisable image URIs to delete")
      return
    }

    val ids = uris.map { it.lastPathSegment.orEmpty() }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        pendingDelete = PendingDelete(ids, promise)
        val request = MediaStore.createDeleteRequest(context.contentResolver, uris)
        activity.startIntentSenderForResult(request.intentSender, DELETE_REQUEST, null, 0, 0, 0)
      } else {
        if (!hasLegacyWriteAccess()) {
          promise.reject(ERROR_CODE, "Storage permission is required to delete on this Android version")
          return
        }
        executor.execute {
          var removed = 0
          uris.forEachIndexed { index, uri ->
            if (context.contentResolver.delete(uri, null, null) > 0) {
              removed += 1
              runCatching { store.purgeImage(ids[index]) }
            }
          }
          promise.resolve(removed > 0)
        }
      }
    } catch (error: Throwable) {
      pendingDelete = null
      promise.reject(ERROR_CODE, error.message, error)
    }
  }

  /**
   * Hands the image to the system share sheet by reference. The MediaStore URI is passed straight
   * through with a read grant, so nothing is copied and no FileProvider route is involved.
   */
  @ReactMethod
  fun shareImage(contentUri: String, mimeType: String, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject(ERROR_CODE, "No foreground activity to show the share sheet")
      return
    }
    try {
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = mimeType.ifBlank { "image/*" }
        putExtra(Intent.EXTRA_STREAM, Uri.parse(contentUri))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.startActivity(Intent.createChooser(intent, null))
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject(ERROR_CODE, error.message, error)
    }
  }

  /**
   * Share sheet for several images at once, via ACTION_SEND_MULTIPLE. Same reference-only contract
   * as [shareImage]: URIs are passed through with a read grant and nothing is copied.
   */
  @ReactMethod
  fun shareImages(contentUris: com.facebook.react.bridge.ReadableArray, mimeType: String, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject(ERROR_CODE, "No foreground activity to show the share sheet")
      return
    }

    val uris = ArrayList<Uri>((0 until contentUris.size()).mapNotNull { index ->
      contentUris.getString(index)?.let { runCatching { Uri.parse(it) }.getOrNull() }
    })
    if (uris.isEmpty()) {
      promise.reject(ERROR_CODE, "No recognisable image URIs to share")
      return
    }

    try {
      val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        type = mimeType.ifBlank { "image/*" }
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.startActivity(Intent.createChooser(intent, null))
      promise.resolve(true)
    } catch (error: Throwable) {
      promise.reject(ERROR_CODE, error.message, error)
    }
  }

  /**
   * Forgets everything the AI derived and re-queues the library. Images and user-created categories
   * survive; recognized text, vectors, tokens, labels and inferred categories do not.
   */
  @ReactMethod
  fun clearAiData(promise: Promise) = onBackground(promise) {
    store.clearDerivedData()
    ThumbnailStore(context).clear()
    RecallIndexScheduler.scheduleIfNotPaused(context)
    true
  }

  /** Drops every Recall table. The schema is recreated empty before this returns. */
  @ReactMethod
  fun deleteDatabase(promise: Promise) = onBackground(promise) {
    RecallIndexScheduler.pause(context)
    store.wipe()
    ThumbnailStore(context).clear()
    true
  }

  /** Folders on the device that hold images, with counts and whether each is currently indexed. */
  @ReactMethod
  fun listFolders(promise: Promise) = onBackground(promise) {
    val indexed = store.folderCounts()
    Arguments.createArray().also { array ->
      MediaStoreScanner(context).listFolders().forEach { folder ->
        array.pushMap(Arguments.createMap().apply {
          putString("name", folder.name)
          putInt("imageCount", folder.imageCount)
          putInt("indexedCount", indexed[folder.name] ?: 0)
          putBoolean("isIndexed", folder.isIndexed)
        })
      }
    }
  }

  /**
   * Replaces the indexed-folder scope and rescans. A narrowed scope leaves rows behind for images
   * that are no longer in range, so the rescan runs with deletion enabled to retire them.
   */
  @ReactMethod
  fun setIndexedFolders(folders: com.facebook.react.bridge.ReadableArray, promise: Promise) = onBackground(promise) {
    val selected = (0 until folders.size()).mapNotNull { folders.getString(it) }.toSet()
    RecallIndexPreferences.setIndexedFolders(context, selected)
    RecallIndexScheduler.scheduleIfNotPaused(context)
    true
  }

  /** Which kinds of image are indexed: "screenshotsOnly" or "allImages". */
  @ReactMethod
  fun getIndexScope(promise: Promise) = onBackground(promise) {
    RecallIndexPreferences.indexScope(context).wireValue
  }

  /**
   * Replaces the indexing scope and rescans. Widening picks up images earlier scans skipped;
   * narrowing leaves rows behind for images that no longer qualify, and the rescan retires them the
   * same way a narrowed folder scope does.
   *
   * An unrecognised value is rejected rather than quietly falling back to the default, so a typo
   * surfaces as a failed change instead of silently resetting what the user chose.
   */
  @ReactMethod
  fun setIndexScope(scope: String, promise: Promise) = onBackground(promise) {
    val requested = requireNotNull(RecallIndexPreferences.IndexScope.fromWireValue(scope)) {
      "Unrecognised index scope: $scope"
    }
    RecallIndexPreferences.setIndexScope(context, requested)
    RecallIndexScheduler.scheduleIfNotPaused(context)
    true
  }

  /** What the index occupies on this device. Images are referenced, never copied, so they are absent. */
  @ReactMethod
  fun getStorageInfo(promise: Promise) = onBackground(promise) {
    val footprint = store.storageFootprint()
    Arguments.createMap().apply {
      putDouble("databaseBytes", footprint.databaseBytes.toDouble())
      putDouble("thumbnailBytes", ThumbnailStore(context).totalBytes().toDouble())
      putDouble("indexedImages", footprint.indexedImages.toDouble())
      putDouble("ocrRecords", footprint.ocrRecords.toDouble())
      putDouble("embeddings", footprint.embeddings.toDouble())
      putDouble("tokens", footprint.tokens.toDouble())
    }
  }

  private fun hasLegacyWriteAccess(): Boolean = context.checkSelfPermission(
    android.Manifest.permission.WRITE_EXTERNAL_STORAGE,
  ) == PackageManager.PERMISSION_GRANTED

  @ReactMethod
  fun startWatching() {    if (observer != null) return
    observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
      override fun onChange(selfChange: Boolean, uri: Uri?) {
        RecallIndexScheduler.scheduleIfNotPaused(context)
        if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_CHANGED, uri?.toString())
      }
    }.also { context.contentResolver.registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, it) }
  }

  @ReactMethod fun stopWatching() { observer?.let(context.contentResolver::unregisterContentObserver); observer = null }
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  override fun invalidate() {
    stopWatching()
    context.removeActivityEventListener(activityListener)
    // A delete awaiting confirmation can never resolve now; leaving it would hang the JS promise.
    pendingDelete?.promise?.reject(ERROR_CODE, "Module was torn down before the delete was confirmed")
    pendingDelete = null
    executor.shutdownNow()
    super.invalidate()
  }

  private class PendingDelete(val ids: List<String>, val promise: Promise)

  private fun searchResults(results: List<IndexSearchResult>) = Arguments.createArray().also { array ->
    results.forEach { result ->
      val row = result.row
      array.pushMap(Arguments.createMap().apply {
        putString("id", row.id); putString("title", row.fileName.substringBeforeLast('.')); putString("source", source(row.relativePath))
        putString("uri", row.uri); putString("fileName", row.fileName); putDouble("createdAt", row.createdAt.toDouble())
        putDouble("modifiedAt", row.modifiedAt.toDouble()); putDouble("size", row.size.toDouble())
        putInt("width", row.width); putInt("height", row.height); putString("mimeType", row.mimeType)
        putString("category", row.category); putString("thumbnailUri", row.thumbnailPath?.let { Uri.fromFile(File(it)).toString() })
        putDouble("categoryConfidence", row.categoryConfidence.toDouble()); putArray("tags", strings(row.tags))
        putDouble("score", result.score.toDouble()); putArray("matchedTerms", strings(result.matchedTerms))
        // The streamed ranking row deliberately carries no text; the hydrated snippet is the OCR.
        putString("ocrText", result.ocr.text); putDouble("ocrConfidence", result.ocr.confidence.toDouble())
        putString("ocrLanguage", result.ocr.language)
      })
    }
  }

  private fun strings(values: List<String>) = Arguments.createArray().also { array -> values.forEach(array::pushString) }

  private fun source(path: String) = path.trim('/').substringBefore('/').ifBlank { "Device" }
  private fun onBackground(promise: Promise, block: () -> Any?) = executor.execute {
    try { promise.resolve(block()) } catch (error: Throwable) {
      promise.reject(ERROR_CODE, error.message, error)
    }
  }

  companion object {
    const val EVENT_CHANGED = "ScreenshotMediaStore.changed"
    private const val MAX_RESULTS = 100
    private const val ERROR_CODE = "OFFLINE_IMAGE_PIPELINE_ERROR"

    /** Identifies the system delete-confirmation result on the way back to [activityListener]. */
    private const val DELETE_REQUEST = 4713

    /** More than a handful of suggestions is a chore rather than a shortcut. */
    private const val MAX_SUGGESTIONS = 6
  }
}