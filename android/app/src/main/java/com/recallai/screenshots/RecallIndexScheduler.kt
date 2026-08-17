package com.recallai.screenshots

import android.content.Context
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkInfo
import java.util.concurrent.TimeUnit

object RecallIndexScheduler {
  private const val IMMEDIATE = "recall-image-index-immediate"
  private const val CONTINUATION = "recall-image-index-continuation"
  private const val PERIODIC = "recall-image-index-periodic"
  private const val PREFS = "recall-index"
  private const val PAUSED = "paused"

  fun start(context: Context) {
    setPaused(context, false)
    enqueueImmediate(context)
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
      PeriodicWorkRequestBuilder<RecallIndexWorker>(12, TimeUnit.HOURS)
        .setConstraints(backgroundConstraints()).setInputData(input(scanFirst = true)).build(),
    )
  }

  fun enqueueImmediate(context: Context) {
    if (!isPaused(context)) WorkManager.getInstance(context)
      .enqueueUniqueWork(IMMEDIATE, ExistingWorkPolicy.KEEP, request(scanFirst = true))
  }

  fun enqueueContinuation(context: Context) {
    if (!isPaused(context)) WorkManager.getInstance(context)
      .enqueueUniqueWork(CONTINUATION, ExistingWorkPolicy.APPEND_OR_REPLACE, request(scanFirst = false))
  }

  fun pause(context: Context) {
    setPaused(context, true)
    WorkManager.getInstance(context).cancelUniqueWork(IMMEDIATE)
    WorkManager.getInstance(context).cancelUniqueWork(CONTINUATION)
  }

  fun resume(context: Context) { setPaused(context, false); enqueueImmediate(context) }
  fun scheduleIfNotPaused(context: Context) = enqueueImmediate(context)
  fun isPaused(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(PAUSED, false)

  /** Includes the initial MediaStore scan, before it has inserted rows for count-based status. */
  fun hasActiveWork(context: Context): Boolean {
    val manager = WorkManager.getInstance(context)
    return listOf(IMMEDIATE, CONTINUATION).any { name ->
      manager.getWorkInfosForUniqueWork(name).get().any { info ->
        info.state == WorkInfo.State.ENQUEUED || info.state == WorkInfo.State.RUNNING || info.state == WorkInfo.State.BLOCKED
      }
    }
  }

  // User-triggered and continuation work must start immediately. Battery/storage gates made the UI
  // say "Running" while WorkManager was actually waiting indefinitely for an unknown constraint.
  private fun request(scanFirst: Boolean) = OneTimeWorkRequestBuilder<RecallIndexWorker>()
    .setInputData(input(scanFirst)).build()
  private fun input(scanFirst: Boolean) = Data.Builder().putBoolean(RecallIndexWorker.KEY_SCAN_FIRST, scanFirst).build()
  private fun setPaused(context: Context, paused: Boolean) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(PAUSED, paused).apply()
  private fun backgroundConstraints() = Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED)
    .setRequiresStorageNotLow(true).setRequiresBatteryNotLow(true).build()
}
