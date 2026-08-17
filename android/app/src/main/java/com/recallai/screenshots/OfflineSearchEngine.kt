package com.recallai.screenshots

import android.content.Context
import android.net.Uri
import java.util.PriorityQueue

data class IndexSearchResult(
  val row: SearchRow,
  val score: Float,
  val ocr: OcrResult,
  /** Indexed terms this row matched, so the UI can show why it is here. */
  val matchedTerms: List<String> = emptyList(),
)

/**
 * Explicit search-screen filters. These are instructions, not evidence: unlike the category and date
 * window a query *phrase* implies, every one of them excludes rows outright.
 */
data class SearchFilters(
  val category: String = "",
  val fromMillis: Long = 0L,
  val toMillis: Long = 0L,
  val hasText: Boolean = false,
  val folder: String = "",
) {
  fun withinRange(createdAt: Long): Boolean = toMillis > fromMillis && createdAt >= fromMillis && createdAt < toMillis

  companion object {
    val NONE = SearchFilters()
  }
}

/**
 * Hybrid retrieval over the offline index: the token table supplies exact-word evidence, the stored
 * embeddings supply meaning, and [SearchRanker] combines them with the contextual signals.
 *
 * Two stages, for two different reasons. The streaming pass scores content evidence only and keeps a
 * bounded candidate heap, so peak memory is a function of the page size rather than the library
 * size. The surviving slice is then rescored with category intent, recency, engagement and the
 * requested date window — signals that should reorder relevant results, not manufacture relevance.
 */
class OfflineSearchEngine(
  private val context: Context,
  private val store: RecallIndexStore,
) : AutoCloseable {
  private val mobileClip = MobileClipModel(context)
  /**
   * [filters] are the explicit controls on the search screen. They exclude rows before the candidate
   * heap rather than trimming the ranked page afterwards, so a narrow filter still fills a full page.
   * The category the *phrase* implies is a separate, softer signal owned by [SearchRanker] — a filter
   * is an instruction, an inferred category is only evidence.
   */
  fun searchText(
    query: String,
    limit: Int,
    filters: SearchFilters = SearchFilters.NONE,
    now: Long = System.currentTimeMillis(),
  ): List<IndexSearchResult> {
    val safeLimit = limit.coerceIn(1, MAX_LIMIT)
    val parsed = SearchQuery.parse(query, now)
    val weights = if (parsed.hasTerms) RankingWeights.TEXT else RankingWeights.BROWSE

    val vector = if (parsed.hasTerms) mobileClip.textEmbedding(parsed.phrase) else FloatArray(MobileClipModel.EMBEDDING_DIMENSIONS)
    val vectorQuery = VectorQuery(vector, 0, MobileClipModel.EMBEDDING_DIMENSIONS)

    val lexical = store.lexicalMatches(parsed.tokens, LEXICAL_CANDIDATES)
    val candidates = collect(
      vectorQuery, lexical, weights, now, safeLimit,
      excludedUri = null,
      filters = filters,
    )
    return rank(candidates, parsed, weights, safeLimit)
  }

  /**
   * Similarity uses the stored MobileCLIP vector when available and embeds an unindexed source image
   * on demand otherwise. Both paths use the same 512-dimensional multimodal space.
   */
  fun searchSimilar(uri: String, limit: Int, now: Long = System.currentTimeMillis()): List<IndexSearchResult> {
    val safeLimit = limit.coerceIn(1, MAX_LIMIT)
    val source = store.findByUri(uri)
    val stored = source?.embedding
    val vectorQuery = if (stored != null) {
      VectorQuery(stored, 0, stored.size)
    } else {
      val visual = OfflineImageIntelligence(context).use { it.imageEmbedding(Uri.parse(uri)) }
      VectorQuery(visual, 0, MobileClipModel.EMBEDDING_DIMENSIONS)
    }

    val intent = source?.let { SearchQuery.forCategory(it.category, it.categoryConfidence) } ?: SearchQuery.EMPTY
    val candidates = collect(
      vectorQuery, emptyMap(), RankingWeights.SIMILARITY, now, safeLimit,
      excludedUri = uri,
      filters = SearchFilters.NONE,
    )
    return rank(candidates, intent, RankingWeights.SIMILARITY, safeLimit)
  }

  /** Bounded min-heap: only [capacity] current indexed candidates are retained. */
  private fun collect(
    query: VectorQuery,
    lexical: Map<String, Float>,
    weights: RankingWeights,
    now: Long,
    limit: Int,
    excludedUri: String?,
    filters: SearchFilters,
  ): List<Candidate> {
    val capacity = (limit * CANDIDATE_FACTOR).coerceIn(limit, MAX_CANDIDATES)
    val heap = PriorityQueue<Candidate>(capacity, compareBy(Candidate::relevance))
    store.streamIndexed { row ->
      val embedding = row.embedding ?: return@streamIndexed
      if (row.uri == excludedUri) return@streamIndexed
      if (!matches(row, filters)) return@streamIndexed
      val candidate = Candidate(
        row = row,
        semantic = SearchRanker.cosine(query.vector, query.norm, embedding, query.from, query.to).coerceAtLeast(0f),
        lexical = lexical[row.id] ?: 0f,
        recency = SearchRanker.recency(row.createdAt, now),
        weights = weights,
      )
      if (heap.size < capacity) {
        heap += candidate
      } else if (candidate.relevance > (heap.peek()?.relevance ?: Float.NEGATIVE_INFINITY)) {
        heap.poll()
        heap += candidate
      }
    }
    return heap.toList()
  }

  /**
   * Every filter is a hard exclusion, evaluated per streamed row. All of it reads fields the ranking
   * scan already carries, so filtering costs no extra query and no extra column.
   */
  private fun matches(row: SearchRow, filters: SearchFilters): Boolean {
    if (filters.category.isNotBlank() && !row.category.equals(filters.category, ignoreCase = true)) return false
    if (filters.hasText && !row.hasText) return false
    if (filters.toMillis > filters.fromMillis && !filters.withinRange(row.createdAt)) return false
    if (filters.folder.isNotBlank() && !row.relativePath.contains(filters.folder, ignoreCase = true)) return false
    return true
  }

  /**
   * Full rescoring of the candidate slice, then OCR and matched terms for the page that survives.
   * OCR is hydrated last on purpose: a single text-heavy screenshot can approach the 2 MB
   * CursorWindow limit, so it is read for the handful of winners and never during the scan.
   */
  private fun rank(
    candidates: List<Candidate>,
    parsed: SearchQuery,
    weights: RankingWeights,
    limit: Int,
  ): List<IndexSearchResult> {
    if (candidates.isEmpty()) return emptyList()
    val page = candidates
      .map { candidate -> candidate to SearchRanker.score(candidate.features(parsed), weights) }
      .sortedByDescending { it.second }
      .take(limit)

    val ids = page.map { it.first.row.id }
    val ocr = store.ocrSnippets(ids)
    val matched = if (parsed.hasTerms) store.matchedTokens(ids, parsed.tokens) else emptyMap()
    // Only worth checking for multi-term phrases: a single term is already what the token index
    // matched on, so an exact hit there tells the ranker nothing new.
    val phrase = if (parsed.tokens.size > 1) parsed.phrase else null

    return page
      .map { (candidate, base) ->
        val text = ocr[candidate.row.id] ?: EMPTY_OCR
        val exact = phrase != null && text.text.contains(phrase, ignoreCase = true)
        val score = if (exact) SearchRanker.score(candidate.features(parsed, exactPhrase = true), weights) else base
        IndexSearchResult(candidate.row, score, text, matched[candidate.row.id].orEmpty())
      }
      .sortedByDescending { it.score }
  }

  /** A query vector plus the dimension range it is meaningful over, with its norm computed once. */
  private class VectorQuery(val vector: FloatArray, val from: Int, val to: Int) {
    val norm: Float = SearchRanker.norm(vector, from, to)
  }

  /** Content scores kept alongside the row so stage two does not recompute or re-read anything. */
  private class Candidate(
    val row: SearchRow,
    val semantic: Float,
    val lexical: Float,
    val recency: Float,
    weights: RankingWeights,
  ) {
    val relevance: Float = SearchRanker.relevance(
      RankingFeatures(semantic, lexical, 0f, recency, 0f, inDateRange = false, exactPhrase = false),
      weights,
    )

    fun features(parsed: SearchQuery, exactPhrase: Boolean = false) = RankingFeatures(
      semantic = semantic,
      lexical = lexical,
      category = SearchRanker.categoryAgreement(
        parsed.category, parsed.categoryConfidence, row.category, row.categoryConfidence,
      ),
      recency = recency,
      engagement = SearchRanker.engagement(row.viewCount, row.searchCount),
      inDateRange = parsed.withinRange(row.createdAt),
      exactPhrase = exactPhrase,
    )
  }

  private companion object {
    const val MAX_LIMIT = 100

    /** Over-collect so the contextual pass has room to reorder rather than merely confirm. */
    const val CANDIDATE_FACTOR = 4
    const val MAX_CANDIDATES = 400
    const val LEXICAL_CANDIDATES = 1000
    val EMPTY_OCR = OcrResult("", 0f, "und")
  }

  override fun close() = mobileClip.close()
}
