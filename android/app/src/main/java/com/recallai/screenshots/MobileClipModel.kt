package com.recallai.screenshots

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.graphics.Bitmap
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/** Memory-mapped, fully offline MobileCLIP2-B INT8 image and text encoders. */
class MobileClipModel(private val context: Context) : AutoCloseable {
  private val environment = OrtEnvironment.getEnvironment()
  private val tokenizer by lazy { ClipTokenizer(context) }
  private var imageSession: OrtSession? = null
  private var textSession: OrtSession? = null

  fun imageEmbedding(bitmap: Bitmap): FloatArray {
    val pixels = preprocess(bitmap)
    val tensor = OnnxTensor.createTensor(environment, pixels, longArrayOf(1, 3, IMAGE_SIZE.toLong(), IMAGE_SIZE.toLong()))
    return tensor.use { run(imageSession(), IMAGE_INPUT, it) }
  }

  fun textEmbedding(text: String): FloatArray {
    val tensor = OnnxTensor.createTensor(environment, arrayOf(tokenizer.encode(text)))
    return tensor.use { run(textSession(), TEXT_INPUT, it) }
  }

  private fun run(session: OrtSession, input: String, tensor: OnnxTensor): FloatArray =
    session.run(mapOf(input to tensor)).use { result ->
      @Suppress("UNCHECKED_CAST")
      val output = result[0].value as Array<FloatArray>
      require(output.size == 1 && output[0].size == EMBEDDING_DIMENSIONS) { "Unexpected MobileCLIP output shape" }
      output[0].also(::normalize)
    }

  @Synchronized private fun imageSession() = imageSession ?: session(IMAGE_MODEL).also { imageSession = it }
  @Synchronized private fun textSession() = textSession ?: session(TEXT_MODEL).also { textSession = it }

  private fun session(asset: String): OrtSession {
    val options = OrtSession.SessionOptions().apply {
      setIntraOpNumThreads(2)
      setInterOpNumThreads(1)
      setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
    }
    val descriptor = context.assets.openFd(asset)
    val mapped = FileInputStream(descriptor.fileDescriptor).channel.use { channel ->
      channel.map(java.nio.channels.FileChannel.MapMode.READ_ONLY, descriptor.startOffset, descriptor.declaredLength)
    }
    descriptor.close()
    return environment.createSession(mapped, options).also { options.close() }
  }

  /** Centre-crop and bilinear resize, then planar RGB in the model's verified 0..1 range. */
  private fun preprocess(source: Bitmap): FloatBuffer {
    val edge = minOf(source.width, source.height)
    val cropped = Bitmap.createBitmap(source, (source.width - edge) / 2, (source.height - edge) / 2, edge, edge)
    val resized = Bitmap.createScaledBitmap(cropped, IMAGE_SIZE, IMAGE_SIZE, true)
    if (cropped !== source && cropped !== resized) cropped.recycle()
    val colors = IntArray(IMAGE_SIZE * IMAGE_SIZE)
    resized.getPixels(colors, 0, IMAGE_SIZE, 0, 0, IMAGE_SIZE, IMAGE_SIZE)
    if (resized !== source) resized.recycle()
    val buffer = ByteBuffer.allocateDirect(colors.size * 3 * Float.SIZE_BYTES).order(ByteOrder.nativeOrder()).asFloatBuffer()
    for (channel in 0..2) for (color in colors) {
      buffer.put(((color shr (16 - channel * 8)) and 0xff) / 255f)
    }
    buffer.rewind()
    return buffer
  }

  override fun close() { imageSession?.close(); textSession?.close(); imageSession = null; textSession = null }

  companion object {
    const val MODEL_NAME = "MobileCLIP2-B INT8"
    const val EMBEDDING_VERSION = 5
    const val EMBEDDING_DIMENSIONS = 512
    const val IMAGE_SIZE = 224
    private const val IMAGE_MODEL = "mobileclip/mobileclip2_b_image_int8.onnx"
    private const val TEXT_MODEL = "mobileclip/mobileclip2_b_text_int8.onnx"
    private const val IMAGE_INPUT = "pixels"
    private const val TEXT_INPUT = "tokens"

    fun normalize(vector: FloatArray) {
      val norm = kotlin.math.sqrt(vector.sumOf { (it * it).toDouble() }).toFloat()
      if (norm > 0f) for (index in vector.indices) vector[index] /= norm
    }
  }
}
