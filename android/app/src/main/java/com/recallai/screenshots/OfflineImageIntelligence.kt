package com.recallai.screenshots

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import kotlin.math.max
import kotlin.math.sqrt

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

      val descriptor = "${image.fileName} ${ocr.text} ${labels.joinToString(" ")} ${category.category}"
      val semantic = OfflineEmbedding.textEmbedding(descriptor)
      val embedding = FloatArray(EMBEDDING_DIMENSIONS)
      semantic.copyInto(embedding, 0)
      visualDescriptor(bitmap).copyInto(embedding, SEMANTIC_DIMENSIONS)
      normalize(embedding)

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
      FloatArray(EMBEDDING_DIMENSIONS).also { result ->
        visualDescriptor(bitmap).copyInto(result, SEMANTIC_DIMENSIONS)
        normalize(result)
      }
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

  /** 4x4 spatial grid x RGB means and edge energy = 64 compact visual dimensions. */
  private fun visualDescriptor(bitmap: Bitmap): FloatArray {
    val scaled = Bitmap.createScaledBitmap(bitmap, 64, 64, true)
    return try {
      val pixels = IntArray(64 * 64)
      scaled.getPixels(pixels, 0, 64, 0, 0, 64, 64)
      val result = FloatArray(VISUAL_DIMENSIONS)
      for (cellY in 0 until 4) for (cellX in 0 until 4) {
        var red = 0f; var green = 0f; var blue = 0f; var edges = 0f
        for (y in cellY * 16 until (cellY + 1) * 16) for (x in cellX * 16 until (cellX + 1) * 16) {
          val color = pixels[y * 64 + x]
          red += Color.red(color) / 255f; green += Color.green(color) / 255f; blue += Color.blue(color) / 255f
          if (x > cellX * 16) {
            val previous = pixels[y * 64 + x - 1]
            edges += kotlin.math.abs(Color.red(color) - Color.red(previous)) / 255f
          }
        }
        val offset = (cellY * 4 + cellX) * 4
        result[offset] = red / 256f; result[offset + 1] = green / 256f; result[offset + 2] = blue / 256f
        result[offset + 3] = edges / 240f
      }
      result
    } finally {
      if (scaled !== bitmap) scaled.recycle()
    }
  }

  override fun close() {
    ocrProcessor.close()
    labeler.close()
  }

  companion object {
    /** Bumped to 3 for Phase 2: OCR confidence/language, tags and the reworked category set. */
    const val EMBEDDING_VERSION = 3
    const val SEMANTIC_DIMENSIONS = 128
    const val VISUAL_DIMENSIONS = 64
    const val EMBEDDING_DIMENSIONS = SEMANTIC_DIMENSIONS + VISUAL_DIMENSIONS
    private const val MAX_DECODE_EDGE = 1280
    private const val MAX_LABELS = 8

    fun normalize(vector: FloatArray) {
      val norm = sqrt(vector.sumOf { (it * it).toDouble() }).toFloat()
      if (norm > 0f) for (i in vector.indices) vector[i] /= norm
    }
  }
}

object OfflineEmbedding {
  fun tokenize(text: String): List<String> =
    TOKEN.findAll(text.lowercase()).map { it.value }.filter { it.length > 1 }.toList()

  fun categoryFor(text: String): String = ScreenshotCategorizer.categorize("", text, emptyList()).category

  /**
   * Hashed bag-of-words with category-keyword expansion, so "money" and "invoice" land near each
   * other even though neither string appears in the other's screenshot.
   */
  fun textEmbedding(text: String): FloatArray {
    val result = FloatArray(OfflineImageIntelligence.SEMANTIC_DIMENSIONS)
    val expanded = tokenize(text).toMutableList()
    val inferredCategory = categoryFor(text)
    if (inferredCategory != ScreenshotCategorizer.OTHER) {
      expanded += tokenize(inferredCategory)
      expanded += ScreenshotCategorizer.keywordsFor(inferredCategory)
    }
    expanded.forEach { token ->
      result[positiveHash(token) % result.size] += 1f
      result[positiveHash("semantic:$token") % result.size] += 0.35f
    }
    OfflineImageIntelligence.normalize(result)
    return result
  }

  private fun positiveHash(value: String) = value.hashCode() and Int.MAX_VALUE
  private val TOKEN = Regex("[\\p{L}\\p{N}]+")
}
