package com.recallai.screenshots

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

class RecallIndexWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    if (RecallIndexScheduler.isPaused(applicationContext)) return Result.success()
    val store = RecallIndexStore(applicationContext)
    return try {
      store.ensureReady()
      if (inputData.getBoolean(KEY_SCAN_FIRST, false)) {
        val scanner = MediaStoreScanner(applicationContext)
        scanner.scanIntoStore(store, allowDeletion = MediaStoreScanner.hasFullLibraryAccess(applicationContext))
      }
      store.resetStaleProcessing(System.currentTimeMillis() - STALE_PROCESSING_MS)
      val batch = store.claimBatch(BATCH_SIZE)

      // cacheDir is reclaimable by the platform, so an indexed row can lose its thumbnail without
      // ever becoming Pending again. Detected with plain file checks so an idle run costs no models.
      //
      // Deferred until the indexing queue drains: repair is maintenance, and running it on every
      // batch meant stat-ing THUMBNAIL_REPAIR_SCAN files per handful of images indexed — on a first
      // run of a large library, tens of thousands of file checks interleaved with the OCR and
      // embedding work they compete with.
      val thumbnails = ThumbnailStore(applicationContext)
      val orphaned = if (batch.isNotEmpty()) {
        emptyList()
      } else {
        store.thumbnailCandidates(THUMBNAIL_REPAIR_SCAN)
          .filter { thumbnails.isMissing(it.thumbnailPath) }
          .take(THUMBNAIL_REPAIR_LIMIT)
      }

      if (batch.isEmpty() && orphaned.isEmpty()) {
        thumbnails.prune()
        return Result.success()
      }

      // Constructing the ML Kit recognizer and labeler dominates per-image cost, so one instance
      // covers the whole batch and is only created once there is real work.
      OfflineImageIntelligence(applicationContext).use { intelligence ->
        batch.forEach { image ->
          currentCoroutineContext().ensureActive()
          if (RecallIndexScheduler.isPaused(applicationContext)) return Result.success()
          try {
            store.complete(image, intelligence.process(image))
          } catch (error: SecurityException) {
            store.fail(image.id, error.message ?: "Image permission was revoked", retryable = false)
          } catch (error: Throwable) {
            store.fail(image.id, error.message ?: error.javaClass.simpleName, retryable = runAttemptCount < 2)
          }
        }

        orphaned.forEach { image ->
          currentCoroutineContext().ensureActive()
          if (RecallIndexScheduler.isPaused(applicationContext)) return Result.success()
          // A repair failure must not reopen the row for a full re-index: OCR, category and
          // embedding are all still valid, only the cached file is gone.
          runCatching { store.updateThumbnail(image.id, intelligence.regenerateThumbnail(image)) }
        }

        // One tree walk per batch rather than one listing per thumbnail written.
        intelligence.pruneThumbnailCache()
      }
      // A capped repair pass can leave more orphans behind, so keep the chain alive for those too.
      if (store.hasPending() || orphaned.size >= THUMBNAIL_REPAIR_LIMIT) {
        RecallIndexScheduler.enqueueContinuation(applicationContext)
      }
      Result.success()
    } catch (error: SecurityException) {
      Result.failure()
    } catch (error: Throwable) {
      if (runAttemptCount < 2) Result.retry() else Result.failure()
    } finally {
      store.close()
    }
  }

  companion object {
    const val KEY_SCAN_FIRST = "scan_first"

    /**
     * Images per run. Each run reopens the store, constructs the ML Kit models and enqueues a
     * continuation, so a small batch pays that fixed cost very often; too large a batch risks
     * WorkManager's execution window on a slow device. Sixteen keeps a run comfortably short.
     */
    private const val BATCH_SIZE = 16
    private const val STALE_PROCESSING_MS = 30 * 60 * 1000L

    /** Newest indexed rows checked for a reclaimed thumbnail, once indexing has drained. */
    private const val THUMBNAIL_REPAIR_SCAN = 240

    /** Repairs are capped per run so a wiped cache cannot starve real indexing work. */
    private const val THUMBNAIL_REPAIR_LIMIT = 12
  }
}