package com.recallai.screenshots

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflinePipelineTest {
  @Test
  fun supportedLocationsCoverRequestedMediaFolders() {
    assertTrue(MediaStoreScanner.isSupportedLocation("Pictures/Screenshots/", "Screenshots", "capture.png"))
    assertTrue(MediaStoreScanner.isSupportedLocation("DCIM/Camera/", "Camera", "photo.jpg"))
    assertTrue(MediaStoreScanner.isSupportedLocation("Download/", "Download", "ticket.png"))
    assertFalse(MediaStoreScanner.isSupportedLocation("Movies/", "Movies", "frame.png"))
  }

  @Test
  fun categoryUsesOfflineScreenshotSignals() {
    assertEquals("Travel", OfflineEmbedding.categoryFor("Booking.com flight reservation at airport"))
    assertEquals("Finance", OfflineEmbedding.categoryFor("Bank transfer payment receipt"))
    assertEquals("Other", OfflineEmbedding.categoryFor("untitled capture"))
  }

  @Test
  fun embeddingSerializationRoundTrips() {
    val source = floatArrayOf(-0.5f, 0f, 0.125f, 42.75f)
    assertArrayEquals(source, RecallIndexStore.decodeEmbedding(RecallIndexStore.encodeEmbedding(source)), 0f)
  }

  @Test
  fun textEmbeddingsAreNormalizedAndDeterministic() {
    val first = OfflineEmbedding.textEmbedding("Find my hotel booking")
    val second = OfflineEmbedding.textEmbedding("Find my hotel booking")
    assertArrayEquals(first, second, 0f)
    val squaredNorm = first.sumOf { (it * it).toDouble() }
    assertEquals(1.0, squaredNorm, 0.0001)
  }
}