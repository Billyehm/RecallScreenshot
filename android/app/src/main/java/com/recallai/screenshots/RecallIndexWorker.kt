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
      if (batch.isEmpty()) return Result.success()
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
      }
      if (store.hasPending()) RecallIndexScheduler.enqueueContinuation(applicationContext)
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
    private const val BATCH_SIZE = 8
    private const val STALE_PROCESSING_MS = 30 * 60 * 1000L
  }
}