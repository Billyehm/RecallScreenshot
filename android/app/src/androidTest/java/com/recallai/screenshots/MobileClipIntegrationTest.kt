package com.recallai.screenshots

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Runs the same bundled ONNX graphs and tokenizer that production WorkManager uses. */
class MobileClipIntegrationTest {
  private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

  @Test fun imageAndTextEncodersProduceNormalizedSharedDimensions() {
    val bitmap = Bitmap.createBitmap(224, 224, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(80, 120, 170)) }
    MobileClipModel(context).use { model ->
      val image = model.imageEmbedding(bitmap)
      val text = model.textEmbedding("a blue photograph")
      assertEquals(512, image.size)
      assertEquals(512, text.size)
      assertEquals(1.0, image.sumOf { (it * it).toDouble() }, 0.001)
      assertEquals(1.0, text.sumOf { (it * it).toDouble() }, 0.001)
    }
    bitmap.recycle()
  }

  @Test fun tokenizerMatchesOfficialMobileClipTokens() {
    assertTrue(ClipTokenizer(context).encode("a man holding his waist").contentEquals(longArrayOf(
      49406, 320, 786, 5050, 787, 18459, 49407,
      *LongArray(70),
    )))
  }
}
