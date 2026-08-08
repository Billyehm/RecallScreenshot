package com.recallai.screenshots

import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class OcrResult(
  val text: String,
  /** Mean ML Kit line confidence in 0..1; 0 when no text was found. */
  val confidence: Float,
  /** BCP-47 tag reported for the dominant block, or "und" when undetermined. */
  val language: String,
) {
  val isEmpty: Boolean get() = text.isBlank()
}

/**
 * On-device Latin text recognition. The bundled model ships inside the APK, so no image or text
 * ever leaves the device and recognition works with the radio off.
 *
 * The recognizer is expensive to construct, so one instance is reused across a whole worker batch
 * and closed with the owning [OfflineImageIntelligence].
 */
class OcrProcessor : AutoCloseable {
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  suspend fun extract(input: InputImage): OcrResult {
    val recognized = recognizer.process(input).awaitTask()
    val text = recognized.text.trim()
    if (text.isBlank()) return OcrResult("", 0f, UNDETERMINED)

    val confidences = recognized.textBlocks.flatMap { block -> block.lines.map { it.confidence } }
    val confidence = if (confidences.isEmpty()) 0f else confidences.average().toFloat()

    // Longest block wins: a screenshot's chrome often recognizes as a different language than body text.
    val language = recognized.textBlocks
      .maxByOrNull { it.text.length }
      ?.recognizedLanguage
      ?.takeIf { it.isNotBlank() }
      ?: UNDETERMINED

    return OcrResult(text, confidence.coerceIn(0f, 1f), language)
  }

  override fun close() = recognizer.close()

  private companion object {
    const val UNDETERMINED = "und"
  }
}

internal suspend fun <T> com.google.android.gms.tasks.Task<T>.awaitTask(): T =
  suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { continuation.resume(it) }
    addOnFailureListener { continuation.resumeWithException(it) }
    addOnCanceledListener { continuation.cancel() }
  }
