package com.recallai.screenshots

import android.content.Context
import android.net.Uri
import java.util.PriorityQueue
import kotlin.math.sqrt

data class IndexSearchResult(
  val row: SearchRow,
  val score: Float,
  val ocr: OcrResult,
)

class OfflineSearchEngine(
  private val context: Context,
  private val store: RecallIndexStore,
) {
  /**
   * Hybrid text search: lexical coverage over the token index blended with hash-embedding
   * similarity. The ranking pass streams ids and vectors only — OCR bodies are read afterwards for
   * the winning rows alone, so a text-heavy library never pulls megabytes through the CursorWindow.
   */
  fun searchText(query: String, limit: Int): List<IndexSearchResult> {
    val safeLimit = limit.coerceIn(1, 100)
    val semantic = OfflineEmbedding.textEmbedding(query)
    val queryEmbedding = FloatArray(OfflineImageIntelligence.EMBEDDING_DIMENSIONS).also { semantic.copyInto(it) }
    OfflineImageIntelligence.normalize(queryEmbedding)
    val tokens = OfflineEmbedding.tokenize(query).distinct().take(MAX_QUERY_TOKENS)
    val lexical = store.lexicalMatches(tokens, LEXICAL_CANDIDATES)
    return hydrate(topK(queryEmbedding, safeLimit, lexical, SEMANTIC_WEIGHT, excludedUri = null))
  }

  fun searchSimilar(uri: String, limit: Int): List<IndexSearchResult> {
    val safeLimit = limit.coerceIn(1, 100)
    val stored = store.findByUri(uri)?.embedding
    val queryEmbedding = stored ?: OfflineImageIntelligence(context).use { it.imageEmbedding(Uri.parse(uri)) }
    return hydrate(topK(queryEmbedding, safeLimit, emptyMap(), semanticWeight = 1f, excludedUri = uri))
  }

  private fun hydrate(ranked: List<ScoredRow>): List<IndexSearchResult> {
    val ocr = store.ocrSnippets(ranked.map { it.row.id })
    return ranked.map { IndexSearchResult(it.row, it.score, ocr[it.row.id] ?: EMPTY_OCR) }
  }

  /** Bounded min-heap: only [limit] results are ever retained, whatever the library size. */
  private fun topK(
    query: FloatArray,
    limit: Int,
    lexical: Map<String, Float>,
    semanticWeight: Float,
    excludedUri: String?,
  ): List<ScoredRow> {
    val queryNorm = sqrt(query.sumOf { (it * it).toDouble() }).toFloat()
    val heap = PriorityQueue<ScoredRow>(limit, compareBy(ScoredRow::score))
    store.streamIndexed { row ->
      val embedding = row.embedding ?: return@streamIndexed
      if (row.uri == excludedUri || embedding.size != query.size) return@streamIndexed
      val cosine = cosine(query, queryNorm, embedding).coerceAtLeast(0f)
      val score = semanticWeight * cosine + (1f - semanticWeight) * (lexical[row.id] ?: 0f)
      if (heap.size < limit) {
        heap += ScoredRow(row, score)
      } else if (score > (heap.peek()?.score ?: Float.NEGATIVE_INFINITY)) {
        heap.poll()
        heap += ScoredRow(row, score)
      }
    }
    return heap.sortedByDescending { it.score }
  }

  /** Stored vectors are normalized at write time, so only the query norm has to be divided out. */
  private fun cosine(query: FloatArray, queryNorm: Float, candidate: FloatArray): Float {
    if (queryNorm == 0f) return 0f
    var dot = 0f
    var candidateNorm = 0f
    for (index in query.indices) {
      dot += query[index] * candidate[index]
      candidateNorm += candidate[index] * candidate[index]
    }
    val denominator = queryNorm * sqrt(candidateNorm)
    return if (denominator == 0f) 0f else dot / denominator
  }

  private data class ScoredRow(val row: SearchRow, val score: Float)

  private companion object {
    const val SEMANTIC_WEIGHT = 0.72f
    const val MAX_QUERY_TOKENS = 8
    const val LEXICAL_CANDIDATES = 1000
    val EMPTY_OCR = OcrResult("", 0f, "und")
  }
}
