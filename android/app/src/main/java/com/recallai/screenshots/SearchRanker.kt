package com.recallai.screenshots

import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt

/** One candidate reduced to comparable 0..1 signals. */
data class RankingFeatures(
  /** Cosine between query and stored vector over the comparable dimension range. */
  val semantic: Float,
  /** Coverage-weighted token-index match, normalized across the candidate set. */
  val lexical: Float,
  /** Agreement between the category the phrase implies and the one the image was filed under. */
  val category: Float,
  /** Exponential decay on age. */
  val recency: Float,
  /** How often the user has opened or re-found this image. */
  val engagement: Float,
  /** The phrase named a period and this image falls inside it. */
  val inDateRange: Boolean,
  /** The query terms appear verbatim in the recognized text. */
  val exactPhrase: Boolean,
)

/**
 * What each signal is worth. A text query and a similarity query weigh the same features very
 * differently — similarity has no terms to match, so the vector is the entire answer.
 */
data class RankingWeights(
  val semantic: Float,
  val lexical: Float,
  val category: Float,
  val recency: Float,
  val engagement: Float,
) {
  /** Content evidence only. Everything else describes context, not relevance. */
  val content: Float get() = semantic + lexical

  companion object {
    /** Lexical and semantic carry a text query together: one finds exact words, the other meaning. */
    val TEXT = RankingWeights(semantic = 0.44f, lexical = 0.36f, category = 0.10f, recency = 0.07f, engagement = 0.03f)

    val SIMILARITY = RankingWeights(semantic = 0.88f, lexical = 0f, category = 0.05f, recency = 0.05f, engagement = 0.02f)

    /** The phrase reduced to nothing searchable ("show me my screenshots"); recency leads. */
    val BROWSE = RankingWeights(semantic = 0.28f, lexical = 0f, category = 0.10f, recency = 0.56f, engagement = 0.06f)
  }
}

/**
 * Pure scoring — no database, no Android, no I/O. Ranking used to be one expression buried in the
 * search loop, which made it impossible to assert that a closer vector actually ranks higher. Here
 * every signal is a named function that a unit test can pin down on its own.
 */
object SearchRanker {
  /** Being inside the period the user named is strong evidence, but never the only evidence. */
  const val DATE_RANGE_BONUS = 0.14f

  /** Applied after OCR is hydrated, so it can only reorder results that already ranked. */
  const val EXACT_PHRASE_BONUS = 0.10f

  /**
   * Stage one: content evidence alone, used to decide which rows survive the bounded candidate
   * heap. Context signals are kept out deliberately — recency in the cut would let a brand-new
   * unrelated screenshot displace an older exact match before anything got a chance to rank it.
   */
  fun relevance(features: RankingFeatures, weights: RankingWeights): Float {
    val total = weights.content
    if (total <= 0f) return features.recency
    val content = (weights.semantic * features.semantic + weights.lexical * features.lexical) / total
    // A query with no usable terms produces a zero vector, so every row ties on content. Recency
    // then decides the cut, scaled far below any real match so it can never outrank one.
    return if (content > 0f) content else features.recency * RECENCY_FALLBACK_SCALE
  }

  /** Stage two: the full picture, applied to the surviving slice only. */
  fun score(features: RankingFeatures, weights: RankingWeights): Float {
    var total = weights.semantic * features.semantic +
      weights.lexical * features.lexical +
      weights.category * features.category +
      weights.recency * features.recency +
      weights.engagement * features.engagement
    if (features.inDateRange) total += DATE_RANGE_BONUS
    if (features.exactPhrase) total += EXACT_PHRASE_BONUS
    return total
  }

  /** Half-life decay: today beats last year, but age alone never sinks a strong content match. */
  fun recency(createdAt: Long, now: Long): Float {
    if (createdAt <= 0L) return 0f
    val ageDays = (now - createdAt).toDouble() / DAY_MILLIS
    if (ageDays <= 0.0) return 1f
    return exp(-LN_2 * ageDays / RECENCY_HALF_LIFE_DAYS).toFloat()
  }

  /** Saturating: the gap between never opened and opened three times matters; 40 versus 43 does not. */
  fun engagement(viewCount: Int, searchCount: Int): Float {
    val signal = (viewCount.coerceAtLeast(0) + SEARCH_WEIGHT * searchCount.coerceAtLeast(0)).toDouble()
    if (signal <= 0.0) return 0f
    return (ln(1.0 + signal) / ln(1.0 + ENGAGEMENT_SATURATION)).coerceIn(0.0, 1.0).toFloat()
  }

  /**
   * A boost, never a filter. Hard-filtering on category would drop correct results the categorizer
   * happened to score low, which is the failure users notice. The geometric mean keeps a confident
   * query against an uncertain image from scoring as if both were certain.
   */
  fun categoryAgreement(intent: String, intentConfidence: Float, rowCategory: String, rowConfidence: Float): Float {
    if (intent == ScreenshotCategorizer.OTHER || !intent.equals(rowCategory, ignoreCase = true)) return 0f
    return sqrt(intentConfidence.coerceIn(0f, 1f) * rowConfidence.coerceIn(0f, 1f))
  }

  fun norm(values: FloatArray, from: Int, to: Int): Float {
    if (from >= to || to > values.size) return 0f
    var sum = 0f
    for (index in from until to) sum += values[index] * values[index]
    return sqrt(sum)
  }

  /**
   * Cosine over a half-open dimension range, with the query norm supplied once per search rather
   * than recomputed per candidate.
   *
   * The range matters. A text query fills only the semantic half of the vector and an un-indexed
   * image fills only the visual half, while stored vectors are normalized across both. Comparing
   * over the full length would therefore rank by how much of each stored vector's magnitude happens
   * to sit in the half the query can see. Restricting both sides to the same range and normalizing
   * there compares like with like.
   */
  fun cosine(query: FloatArray, queryNorm: Float, candidate: FloatArray, from: Int, to: Int): Float {
    if (queryNorm <= 0f || from >= to || to > query.size || to > candidate.size) return 0f
    var dot = 0f
    var candidateNorm = 0f
    for (index in from until to) {
      dot += query[index] * candidate[index]
      candidateNorm += candidate[index] * candidate[index]
    }
    val denominator = queryNorm * sqrt(candidateNorm)
    return if (denominator <= 0f) 0f else dot / denominator
  }

  /** Whole-vector cosine, for callers that have no range to restrict. */
  fun cosine(query: FloatArray, candidate: FloatArray): Float {
    val length = minOf(query.size, candidate.size)
    return cosine(query, norm(query, 0, length), candidate, 0, length)
  }

  /** A repeat search is a stronger endorsement than an incidental open. */
  private const val SEARCH_WEIGHT = 2

  private const val RECENCY_HALF_LIFE_DAYS = 45.0
  private const val ENGAGEMENT_SATURATION = 12.0
  private const val DAY_MILLIS = 86_400_000.0
  private const val LN_2 = 0.6931471805599453

  /** Keeps termless browsing deterministic without letting it compete with real relevance. */
  private const val RECENCY_FALLBACK_SCALE = 1e-3f
}
