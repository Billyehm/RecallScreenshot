package com.recallai.screenshots

import android.content.ContentUris
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.security.MessageDigest
import java.util.Locale

class ScreenshotMediaStoreModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var observer: ContentObserver? = null

  override fun getName(): String = "ScreenshotMediaStore"

  @ReactMethod
  fun queryScreenshots(limit: Int, offset: Int, promise: Promise) {
    try {
      val screenshots = Arguments.createArray()
      val uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      val projection = mutableListOf(
        MediaStore.Images.Media._ID,
        MediaStore.Images.Media.DISPLAY_NAME,
        MediaStore.Images.Media.DATE_ADDED,
        MediaStore.Images.Media.DATE_MODIFIED,
        MediaStore.Images.Media.SIZE,
        MediaStore.Images.Media.WIDTH,
        MediaStore.Images.Media.HEIGHT,
        MediaStore.Images.Media.BUCKET_DISPLAY_NAME
      )

      projection.add(MediaStore.Images.Media.DATA)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) projection.add(MediaStore.Images.Media.RELATIVE_PATH)

      val selectionParts = mutableListOf(
        "${MediaStore.Images.Media.DISPLAY_NAME} LIKE ?",
        "${MediaStore.Images.Media.BUCKET_DISPLAY_NAME} LIKE ?"
      )
      val selectionArgs = mutableListOf("%Screenshot%", "%Screenshot%")

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        selectionParts.add("${MediaStore.Images.Media.RELATIVE_PATH} LIKE ?")
        selectionArgs.add("%Screenshot%")
      } else {
        selectionParts.add("${MediaStore.Images.Media.DATA} LIKE ?")
        selectionArgs.add("%Screenshot%")
      }

      val selection = selectionParts.joinToString(" OR ")
      val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC LIMIT $limit OFFSET $offset"
      reactContext.contentResolver.query(uri, projection.toTypedArray(), selection, selectionArgs.toTypedArray(), sortOrder)?.use { cursor ->
        val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
        val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
        val dateAddedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
        val dateModifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED)
        val sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
        val widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH)
        val heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT)
        val bucketColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
        val dataColumn = cursor.getColumnIndex(MediaStore.Images.Media.DATA)
        val relativePathColumn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) cursor.getColumnIndex(MediaStore.Images.Media.RELATIVE_PATH) else -1

        val seen = mutableSetOf<Long>()
        while (cursor.moveToNext()) {
          val id = cursor.getLong(idColumn)
          if (!seen.add(id)) continue

          val name = cursor.getString(nameColumn).orEmpty()
          val bucket = cursor.getString(bucketColumn).orEmpty()
          val absolutePath = if (dataColumn >= 0) cursor.getString(dataColumn).orEmpty() else ""
          val relativePath = if (relativePathColumn >= 0) cursor.getString(relativePathColumn).orEmpty() else ""
          val path = "$absolutePath $relativePath"

          if (!isScreenshot(name, bucket, path)) continue

          val contentUri = ContentUris.withAppendedId(uri, id).toString()
          val item = Arguments.createMap()
          item.putString("id", id.toString())
          item.putString("title", if (name.isBlank()) "Screenshot" else name)
          item.putString("source", bucket.ifBlank { "Screenshots" })
          item.putString("uri", contentUri)
          item.putString("absolutePath", if (absolutePath.isBlank()) null else absolutePath)
          item.putString("fileName", name)
          item.putDouble("createdAt", cursor.getLong(dateAddedColumn) * 1000.0)
          item.putDouble("modifiedAt", cursor.getLong(dateModifiedColumn) * 1000.0)
          item.putDouble("size", cursor.getLong(sizeColumn).toDouble())
          item.putInt("width", cursor.getInt(widthColumn))
          item.putInt("height", cursor.getInt(heightColumn))
          screenshots.pushMap(item)
        }
      }

      promise.resolve(screenshots)
    } catch (error: Throwable) {
      promise.reject("SCREENSHOT_QUERY_FAILED", error)
    }
  }

  @ReactMethod
  fun getSha256(contentUri: String, promise: Promise) {
    try {
      val uri = Uri.parse(contentUri)
      val digest = MessageDigest.getInstance("SHA-256")
      reactContext.contentResolver.openInputStream(uri).use { input ->
        if (input == null) {
          promise.resolve(null)
          return
        }

        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          digest.update(buffer, 0, read)
        }
      }
      promise.resolve(digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) })
    } catch (error: Throwable) {
      promise.reject("SCREENSHOT_HASH_FAILED", error)
    }
  }

  @ReactMethod
  fun startWatching() {
    if (observer != null) return

    observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
      override fun onChange(selfChange: Boolean) {
        emitChange()
      }

      override fun onChange(selfChange: Boolean, uri: Uri?) {
        emitChange()
      }
    }

    reactContext.contentResolver.registerContentObserver(
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      true,
      observer as ContentObserver
    )
  }

  @ReactMethod
  fun stopWatching() {
    observer?.let { reactContext.contentResolver.unregisterContentObserver(it) }
    observer = null
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  override fun invalidate() {
    stopWatching()
    super.invalidate()
  }

  private fun emitChange() {
    val payload: WritableMap = Arguments.createMap()
    payload.putDouble("changedAt", System.currentTimeMillis().toDouble())
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("ScreenshotMediaStore.changed", payload)
  }

  private fun isScreenshot(name: String, bucket: String, path: String): Boolean {
    val haystack = "$name $bucket $path".lowercase(Locale.US)
    return haystack.contains("screenshot") || haystack.contains("screenshots")
  }

}
