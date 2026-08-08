package com.recallai.screenshots

import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.runBlocking
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

class ScreenshotMediaStoreModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  private val store by lazy { RecallIndexStore(context).also(RecallIndexStore::ensureReady) }
  private val searchEngine by lazy { OfflineSearchEngine(context, store) }
  private var observer: ContentObserver? = null

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

  @ReactMethod
  fun searchText(query: String, limit: Int, promise: Promise) = onBackground(promise) {
    searchResults(runBlocking { searchEngine.searchText(query, limit.coerceIn(1, 100)) })
  }

  @ReactMethod
  fun searchSimilar(contentUri: String, limit: Int, promise: Promise) = onBackground(promise) {
    searchResults(runBlocking { searchEngine.searchSimilar(contentUri, limit.coerceIn(1, 100)) })
  }

  @ReactMethod
  fun startWatching() {
    if (observer != null) return
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

  override fun invalidate() { stopWatching(); executor.shutdownNow(); super.invalidate() }

  private fun searchResults(results: List<IndexSearchResult>) = Arguments.createArray().also { array ->
    results.forEach { result ->
      val row = result.row
      array.pushMap(Arguments.createMap().apply {
        putString("id", row.id); putString("title", row.fileName.substringBeforeLast('.')); putString("source", source(row.relativePath))
        putString("uri", row.uri); putString("fileName", row.fileName); putDouble("createdAt", row.createdAt.toDouble())
        putDouble("modifiedAt", row.modifiedAt.toDouble()); putDouble("size", row.size.toDouble())
        putInt("width", row.width); putInt("height", row.height); putString("mimeType", row.mimeType)
        putString("category", row.category); putString("thumbnailUri", row.thumbnailPath?.let { Uri.fromFile(File(it)).toString() })
        putDouble("score", result.score.toDouble()); putString("ocrText", row.ocrText)
      })
    }
  }

  private fun source(path: String) = path.trim('/').substringBefore('/').ifBlank { "Device" }
  private fun onBackground(promise: Promise, block: () -> Any?) = executor.execute {
    try { promise.resolve(block()) } catch (error: Throwable) {
      promise.reject("OFFLINE_IMAGE_PIPELINE_ERROR", error.message, error)
    }
  }

  companion object { const val EVENT_CHANGED = "ScreenshotMediaStore.changed" }
}