package com.recallai.screenshots

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import kotlin.math.max

data class ImageIntelligenceResult(
  val thumbnailPath: String,
  val ocr: OcrResult,
  val labels: List<String>,
  val category: String,
  val tags: List<String>,
  val categoryConfidence: Float,
  val embedding: FloatArray,
)

/**
 * Fully on-device inference. Both ML Kit models are the bundled variants, so nothing is downloaded
 * at runtime and no image or extracted text leaves the device.
 *
 * One instance is held for a whole worker batch: constructing the recognizer and labeler dominates
 * per-image cost, so they are created once and closed together.
 */
class OfflineImageIntelligence(private val context: Context) : AutoCloseable {
  private val ocrProcessor = OcrProcessor()
  private val labeler = ImageLabeling.getClient(
    ImageLabelerOptions.Builder().setConfidenceThreshold(0.55f).build(),
  )
  private val thumbnails = ThumbnailStore(context)
  private val mobileClip = MobileClipModel(context)

  /**
   * Stages: decode once -> thumbnail -> OCR -> categorization -> embedding. The single decode is
   * the whole memory story; a full-resolution bitmap is never materialized.
   */
  suspend fun process(image: PendingImage): ImageIntelligenceResult {
    val bitmap = decodeSampled(Uri.parse(image.uri), MAX_DECODE_EDGE)
      ?: throw IllegalArgumentException("Image could not be decoded")
    try {
      val thumbnailPath = thumbnails.write(image.id, image.modifiedAt, bitmap, image.thumbnailPath)

      val input = InputImage.fromBitmap(bitmap, 0)
      val ocr = ocrProcessor.extract(input)
      val labels = labeler.process(input).awaitTask().map { it.text.lowercase() }.distinct().take(MAX_LABELS)

      val category = ScreenshotCategorizer.categorize(image.fileName, ocr.text, labels)

      val embedding = mobileClip.imageEmbedding(bitmap)

      return ImageIntelligenceResult(
        thumbnailPath = thumbnailPath,
        ocr = ocr,
        labels = labels,
        category = category.category,
        tags = category.tags,
        categoryConfidence = category.confidence,
        embedding = embedding,
      )
    } finally {
      bitmap.recycle()
    }
  }

  /** Rebuilds only the thumbnail when the platform has reclaimed cacheDir under an indexed row. */
  fun regenerateThumbnail(image: PendingImage): String {
    val bitmap = decodeSampled(Uri.parse(image.uri), MAX_DECODE_EDGE)
      ?: throw IllegalArgumentException("Image could not be decoded")
    return try {
      thumbnails.write(image.id, image.modifiedAt, bitmap, image.thumbnailPath)
    } finally {
      bitmap.recycle()
    }
  }

  fun imageEmbedding(uri: Uri): FloatArray {
    val bitmap = decodeSampled(uri, MAX_DECODE_EDGE) ?: throw IllegalArgumentException("Image could not be decoded")
    return try {
      mobileClip.imageEmbedding(bitmap)
    } finally {
      bitmap.recycle()
    }
  }

  fun pruneThumbnailCache() = thumbnails.prune()

  fun isThumbnailMissing(path: String?) = thumbnails.isMissing(path)

  /**
   * Bounds-only pass first, then a power-of-two [BitmapFactory.Options.inSampleSize] decode. The
   * decoder subsamples while reading, so a 12 MP screenshot never occupies full-resolution heap.
   */
  private fun decodeSampled(uri: Uri, maxEdge: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > maxEdge) sample *= 2
    val options = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    return context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
  }

  override fun close() {
    ocrProcessor.close()
    labeler.close()
    mobileClip.close()
  }

  companion object {
    const val EMBEDDING_VERSION = MobileClipModel.EMBEDDING_VERSION
    const val EMBEDDING_DIMENSIONS = MobileClipModel.EMBEDDING_DIMENSIONS
    private const val MAX_DECODE_EDGE = 1280
    private const val MAX_LABELS = 8

    fun normalize(vector: FloatArray) = MobileClipModel.normalize(vector)
  }
}

object OfflineEmbedding {
  fun tokenize(text: String): List<String> =
    TOKEN.findAll(text.lowercase()).map { it.value }.filter { it.length > 1 }.toList()

  /**
   * Tokens that carry meaning. Filler words are the most frequent strings in any screenshot, so
   * leaving them in would let them dominate both the per-image token budget and the hashed
   * bag-of-words — every image ends up looking slightly like every other one.
   */
  fun contentTokens(text: String): List<String> = tokenize(text).filterNot(STOPWORDS::contains)

  fun categoryFor(text: String): String = ScreenshotCategorizer.categorize("", text, emptyList()).category

  private val TOKEN = Regex("[\\p{L}\\p{N}]+")

  /**
   * Generic English filler plus the words every screenshot file name already contains. Search-intent
   * verbs ("find", "show") are stripped by [SearchQuery] instead — they are noise in a query but can
   * be genuine content inside an image.
   */
  private val STOPWORDS = setOf(
    "the", "and", "for", "are", "but", "not", "you", "your", "yours", "all", "any", "can", "had", "has",
    "have", "her", "his", "its", "our", "out", "she", "that", "their", "them", "then", "there", "these",
    "they", "this", "those", "was", "were", "what", "when", "where", "which", "who", "will", "with",
    "from", "into", "onto", "over", "under", "about", "after", "before", "been", "being", "does", "did",
    "each", "how", "just", "like", "more", "most", "much", "new", "now", "off", "one", "only", "other",
    "some", "such", "than", "too", "use", "very", "way", "why", "would", "should", "could", "here",
    // Two-letter function words. Single characters are already dropped by the tokenizer's length
    // filter, but these survive it and are among the most frequent strings in any screenshot.
    "of", "in", "on", "at", "to", "is", "it", "as", "be", "by", "do", "or", "if", "so", "an", "we",
    "he", "us", "me", "my", "ok", "am", "pm",
    "screenshot", "screenshots", "screen", "shot", "image", "images", "img", "photo", "photos",
    "picture", "pictures", "png", "jpg", "jpeg", "webp", "capture",
  )
}
