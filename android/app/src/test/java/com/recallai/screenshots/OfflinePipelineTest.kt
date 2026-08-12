package com.recallai.screenshots

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OfflinePipelineTest {
  @Test
  fun screenshotsOnlyScopeFindsCapturesWhereverTheyAreSaved() {
    val scope = RecallIndexPreferences.IndexScope.SCREENSHOTS_ONLY

    assertTrue(MediaStoreScanner.matchesScope("Pictures/Screenshots/", "Screenshots", "capture.png", scope))
    // Vendor tools write to their own folder and name the file instead, so the name alone qualifies.
    assertTrue(MediaStoreScanner.matchesScope("DCIM/", "DCIM", "Screenshot_20240110-142233.png", scope))
    // Photos and saved images are not screenshots, wherever they sit.
    assertFalse(MediaStoreScanner.matchesScope("DCIM/Camera/", "Camera", "photo.jpg", scope))
    assertFalse(MediaStoreScanner.matchesScope("Download/", "Download", "ticket.png", scope))
  }

  @Test
  fun allImagesScopeAdmitsEveryKindOfImage() {
    val scope = RecallIndexPreferences.IndexScope.ALL_IMAGES

    assertTrue(MediaStoreScanner.matchesScope("DCIM/Camera/", "Camera", "photo.jpg", scope))
    assertTrue(MediaStoreScanner.matchesScope("Movies/", "Movies", "frame.png", scope))
  }

  @Test
  fun indexingIsNarrowedToScreenshotsUntilTheUserWidensIt() {
    assertEquals(RecallIndexPreferences.IndexScope.SCREENSHOTS_ONLY, RecallIndexPreferences.IndexScope.DEFAULT)
    // A stored value that no longer parses must not widen the scope on the user's behalf.
    assertNull(RecallIndexPreferences.IndexScope.fromWireValue("everything"))
    assertNull(RecallIndexPreferences.IndexScope.fromWireValue(null))
    assertEquals(
      RecallIndexPreferences.IndexScope.ALL_IMAGES,
      RecallIndexPreferences.IndexScope.fromWireValue("allImages"),
    )
  }

  @Test
  fun categoryUsesOfflineScreenshotSignals() {
    assertEquals("Travel", OfflineEmbedding.categoryFor("Booking.com flight reservation at airport"))
    assertEquals("Banking", OfflineEmbedding.categoryFor("Bank transfer payment receipt"))
    assertEquals("Other", OfflineEmbedding.categoryFor("untitled capture"))
  }

  @Test
  fun categoryNamesMatchTheSupportedSet() {
    assertEquals("Social Media", OfflineEmbedding.categoryFor("Instagram followers reel"))
    assertEquals("Messages", OfflineEmbedding.categoryFor("WhatsApp chat unread message"))
    assertEquals("Programming", OfflineEmbedding.categoryFor("github commit branch merge"))
    assertEquals("Shopping", OfflineEmbedding.categoryFor("amazon checkout cart order"))
  }

  @Test
  fun categorizationReportsTagsAndBoundedConfidence() {
    val result = ScreenshotCategorizer.categorize("payslip.png", "Bank statement with iban and balance", emptyList())

    assertEquals("Banking", result.category)
    assertTrue(result.confidence > 0f && result.confidence <= 1f)
    assertTrue(result.tags.isNotEmpty())
    assertTrue(result.tags.contains("iban"))
  }

  @Test
  fun categorizationWithoutSignalStaysUnclassified() {
    val result = ScreenshotCategorizer.categorize("", "", emptyList())

    assertEquals(ScreenshotCategorizer.OTHER, result.category)
    assertEquals(0f, result.confidence, 0f)
    assertTrue(result.tags.isEmpty())
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

  // --- Indexing vocabulary -------------------------------------------------------------------

  @Test
  fun indexTokensDropGenericAndFileNameNoise() {
    assertEquals(
      listOf("bank", "statement", "phone"),
      OfflineEmbedding.contentTokens("Screenshot of the bank statement on my phone"),
    )
    // Two-letter function words survive the tokenizer's length filter and would otherwise be among
    // the most frequent strings in the whole index.
    assertTrue(OfflineEmbedding.contentTokens("in on at to is it").isEmpty())
  }

  @Test
  fun fillerWordsNoLongerReachTheEmbedding() {
    assertArrayEquals(
      OfflineEmbedding.textEmbedding("bank statement"),
      OfflineEmbedding.textEmbedding("the screenshot of my bank statement"),
      0f,
    )
    assertEquals(OfflineImageIntelligence.SEMANTIC_DIMENSIONS, OfflineEmbedding.textEmbedding("bank").size)
  }

  // --- Query understanding -------------------------------------------------------------------

  @Test
  fun queryFillerIsStrippedWithoutStrippingItFromTheIndex() {
    assertEquals(listOf("payment"), SearchQuery.parse("Find me my payment screenshots", NOW).tokens)
    // "find" is noise in a query but genuine recognized text inside an image, so indexing keeps it.
    assertTrue(OfflineEmbedding.contentTokens("find my order").contains("find"))
  }

  @Test
  fun conversationalQueriesResolveToTheCategoryTheyDescribe() {
    assertEquals("Banking", SearchQuery.parse("Find payment screenshots", NOW).category)
    assertEquals("Programming", SearchQuery.parse("Show coding screenshots", NOW).category)
    assertEquals("Messages", SearchQuery.parse("Find my WhatsApp conversation", NOW).category)
    assertEquals("Travel", SearchQuery.parse("my flight ticket", NOW).category)
    assertFalse(SearchQuery.parse("blue rectangle", NOW).hasCategory)
  }

  @Test
  fun relativeTimePhrasesBecomeAWindowRatherThanSearchTerms() {
    val parsed = SearchQuery.parse("receipts from the last 7 days", NOW)

    assertEquals(listOf("receipts"), parsed.tokens)
    assertTrue(parsed.hasDateRange)
    assertTrue(parsed.withinRange(NOW))
    assertTrue(parsed.withinRange(NOW - 3 * DAY))
    assertFalse(parsed.withinRange(NOW - 10 * DAY))
  }

  @Test
  fun namedPeriodsExcludeTheCurrentMoment() {
    val parsed = SearchQuery.parse("screenshots from last week", NOW)

    assertFalse(parsed.hasTerms)
    assertTrue(parsed.hasDateRange)
    assertTrue(parsed.withinRange(parsed.fromMillis))
    // Half-open: the window ends where this week begins.
    assertFalse(parsed.withinRange(parsed.toMillis))
    assertFalse(parsed.withinRange(NOW))
  }

  // --- Ranking -------------------------------------------------------------------------------

  @Test
  fun aCloserVectorAlwaysRanksHigher() {
    val weak = features(semantic = 0.20f)
    val strong = features(semantic = 0.80f)

    assertTrue(SearchRanker.score(strong, RankingWeights.TEXT) > SearchRanker.score(weak, RankingWeights.TEXT))
    assertTrue(
      SearchRanker.score(strong, RankingWeights.SIMILARITY) > SearchRanker.score(weak, RankingWeights.SIMILARITY),
    )
  }

  @Test
  fun contextSignalsCannotManufactureRelevance() {
    val content = features(semantic = 0.6f, lexical = 0.6f)
    val everythingButContent = features(
      category = 1f, recency = 1f, engagement = 1f, inDateRange = true, exactPhrase = true,
    )

    assertTrue(
      SearchRanker.score(content, RankingWeights.TEXT) >
        SearchRanker.score(everythingButContent, RankingWeights.TEXT),
    )
  }

  @Test
  fun theCandidateCutSeesContentEvidenceOnly() {
    val faintMatch = features(semantic = 0.05f)
    val recentNonMatch = features(category = 1f, recency = 1f, engagement = 1f, inDateRange = true)

    assertTrue(
      SearchRanker.relevance(faintMatch, RankingWeights.TEXT) >
        SearchRanker.relevance(recentNonMatch, RankingWeights.TEXT),
    )
    // Contextual signals are invisible to stage one, so they cannot decide who survives it.
    assertEquals(
      SearchRanker.relevance(features(lexical = 0.4f), RankingWeights.TEXT).toDouble(),
      SearchRanker.relevance(features(lexical = 0.4f, category = 1f, engagement = 1f), RankingWeights.TEXT).toDouble(),
      0.0,
    )
  }

  @Test
  fun recencyDecaysByHalfEveryHalfLife() {
    assertEquals(1.0, SearchRanker.recency(NOW, NOW).toDouble(), 1e-6)
    assertEquals(0.5, SearchRanker.recency(NOW - 45 * DAY, NOW).toDouble(), 1e-3)
    assertEquals(0.25, SearchRanker.recency(NOW - 90 * DAY, NOW).toDouble(), 1e-3)
    // An unknown capture date is not a fresh one.
    assertEquals(0.0, SearchRanker.recency(0L, NOW).toDouble(), 0.0)
  }

  @Test
  fun engagementSaturatesSoHeavyUseCannotDominate() {
    assertEquals(0.0, SearchRanker.engagement(0, 0).toDouble(), 0.0)

    val firstOpens = SearchRanker.engagement(3, 0) - SearchRanker.engagement(0, 0)
    val laterOpens = SearchRanker.engagement(43, 0) - SearchRanker.engagement(40, 0)
    assertTrue(firstOpens > laterOpens)

    assertTrue(SearchRanker.engagement(400, 400) <= 1f)
    // Re-finding an image endorses it more than incidentally opening one.
    assertTrue(SearchRanker.engagement(0, 1) > SearchRanker.engagement(1, 0))
  }

  @Test
  fun categoryAgreementBoostsOnlyOnAConfidentMatch() {
    assertEquals(
      0.0,
      SearchRanker.categoryAgreement(ScreenshotCategorizer.OTHER, 1f, "Banking", 1f).toDouble(),
      0.0,
    )
    assertEquals(0.0, SearchRanker.categoryAgreement("Banking", 1f, "Travel", 1f).toDouble(), 0.0)
    assertEquals(1.0, SearchRanker.categoryAgreement("Banking", 1f, "banking", 1f).toDouble(), 1e-6)
    // Geometric mean: an uncertain image drags a confident query down with it.
    assertEquals(0.5, SearchRanker.categoryAgreement("Banking", 0.25f, "Banking", 1f).toDouble(), 1e-6)
  }

  @Test
  fun cosineOverASubRangeIgnoresDimensionsTheQueryCannotSee() {
    // A visual-only query: the semantic half is zero because the image is not indexed yet.
    val query = floatArrayOf(0f, 0f, 1f, 0f)
    // Both candidates point identically in the half the query can see, and differ only in the half
    // it says nothing about.
    val textHeavy = floatArrayOf(3f, 4f, 1f, 0f)
    val visualOnly = floatArrayOf(0f, 0f, 1f, 0f)
    val visualNorm = SearchRanker.norm(query, 2, 4)

    assertEquals(
      SearchRanker.cosine(query, visualNorm, visualOnly, 2, 4).toDouble(),
      SearchRanker.cosine(query, visualNorm, textHeavy, 2, 4).toDouble(),
      1e-6,
    )
    // Whole-vector comparison would have ranked them far apart on nothing but stored text mass.
    assertTrue(SearchRanker.cosine(query, visualOnly) > SearchRanker.cosine(query, textHeavy))
  }

  // --- Collection suggestions ------------------------------------------------------------------

  @Test
  fun leaderClusteringSeparatesUnrelatedVectorsDeterministically() {
    val clusters = LeaderClustering.assign(INTERLEAVED_VECTORS, 0.7f, 8)

    assertEquals(listOf(listOf(0, 2, 4), listOf(1, 3, 5)), clusters)
    // Same library, same groups — which is what makes dismissing one of them meaningful.
    assertEquals(clusters, LeaderClustering.assign(INTERLEAVED_VECTORS, 0.7f, 8))
  }

  @Test
  fun leaderClusteringDropsStraysOnceTheClusterCapIsReached() {
    assertEquals(listOf(listOf(0, 2, 4)), LeaderClustering.assign(INTERLEAVED_VECTORS, 0.7f, 1))
  }

  @Test
  fun distinctivenessIgnoresTermsTheWholeLibraryShares() {
    val rare = DistinctiveTerms.weight(sharedBy = 8, clusterSize = 8, globalDocFrequency = 8, librarySize = 800)
    val common = DistinctiveTerms.weight(sharedBy = 8, clusterSize = 8, globalDocFrequency = 700, librarySize = 800)
    assertTrue(rare > common)

    // A word in every screenshot describes the phone, not the cluster.
    assertEquals(0.0, DistinctiveTerms.weight(8, 8, 800, 800).toDouble(), 0.0)
    // Half the cluster carrying a term is half the evidence for it.
    assertEquals((rare / 2f).toDouble(), DistinctiveTerms.weight(4, 8, 8, 800).toDouble(), 1e-4)
  }

  @Test
  fun generatedNamesRecoverTheSpellingUsedInTheImage() {
    assertEquals("WhatsApp", DistinctiveTerms.displayCase("whatsapp", "Unread messages on WhatsApp"))
    // An all-caps heading is a banner, not a brand's own spelling.
    assertEquals("Payslip", DistinctiveTerms.displayCase("payslip", "MONTHLY PAYSLIP 2024"))
    // Nothing to recover from: still a name, never a bare lowercase token.
    assertEquals("Nebula", DistinctiveTerms.displayCase("nebula", ""))
  }

  private fun features(
    semantic: Float = 0f,
    lexical: Float = 0f,
    category: Float = 0f,
    recency: Float = 0f,
    engagement: Float = 0f,
    inDateRange: Boolean = false,
    exactPhrase: Boolean = false,
  ) = RankingFeatures(semantic, lexical, category, recency, engagement, inDateRange, exactPhrase)

  private companion object {
    /** Fixed so calendar arithmetic is reproducible; assertions stay relative to it. */
    const val NOW = 1_700_000_000_000L
    const val DAY = 86_400_000L

    /** Two tight groups on orthogonal axes, interleaved so order alone cannot separate them. */
    val INTERLEAVED_VECTORS = listOf(
      floatArrayOf(1f, 0f, 0f, 0f),
      floatArrayOf(0f, 0f, 1f, 0f),
      floatArrayOf(0.95f, 0.31f, 0f, 0f),
      floatArrayOf(0f, 0f, 0.95f, 0.31f),
      floatArrayOf(0.9f, 0.44f, 0f, 0f),
      floatArrayOf(0f, 0f, 0.9f, 0.44f),
    )
  }
}