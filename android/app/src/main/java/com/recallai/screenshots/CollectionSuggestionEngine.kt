package com.recallai.screenshots

import kotlin.math.ceil
import kotlin.math.ln

/**
 * A group of screenshots the index thinks belong together, described well enough for the user to
 * accept or reject it without opening any of them.
 */
data class CollectionSuggestion(
  /**
   * Derived from the generated name rather than the membership, so dismissing a suggestion keeps it
   * dismissed as the cluster grows — the alternative reappears the moment one new image joins.
   */
  val id: String,
  val name: String,
  /** The terms that earned the name, for the subtitle. */
  val keywords: List<String>,
  val memberIds: List<String>,
  /** Mean cosine of the members to the centroid: how tight the group actually is. */
  val cohesion: Float,
  val dominantCategory: String,
  val representativeId: String,
  val representativeUri: String,
  val representativeThumbnailPath: String?,
)

/**
 * Groups unfiled screenshots by what they contain, and names each group from its own text.
 *
 * Names come from the cluster's own distinctive terms weighted against the rest of the library, so a
 * group of chat screenshots names itself "WhatsApp" and never a fixed label from a hardcoded list.
 * The representative image is the cluster medoid — chosen, not configured.
 */
class CollectionSuggestionEngine(private val store: RecallIndexStore) {
  fun suggest(maxSuggestions: Int): List<CollectionSuggestion> {
    val summaries = cluster()
      .sortedWith(compareByDescending<Summary> { it.size }.thenByDescending { it.cohesion })
      .take(maxSuggestions.coerceIn(1, MAX_SUGGESTIONS))
    if (summaries.isEmpty()) return emptyList()

    val librarySize = store.indexedDocumentCount().coerceAtLeast(1)
    val medoidText = store.ocrSnippets(summaries.map { it.medoid.row.id })
    return summaries.mapNotNull { summary ->
      describe(summary, librarySize, medoidText[summary.medoid.row.id]?.text ?: "")
    }
  }

  /**
   * The scan is bounded and ordered, so the same library always produces the same groups — which is
   * what makes dismissing one of them meaningful.
   */
  private fun cluster(): List<Summary> {
    val members = mutableListOf<Member>()
    store.streamUnfiled(SCAN_LIMIT) { row -> row.embedding?.let { members += Member(row, it) } }
    if (members.size < MIN_CLUSTER_SIZE) return emptyList()
    return LeaderClustering.assign(members.map { it.vector }, MERGE_THRESHOLD, MAX_CLUSTERS)
      .filter { it.size >= MIN_CLUSTER_SIZE }
      .map { indices -> summarize(indices.map(members::get)) }
  }

  /** Centroid, cohesion and medoid share one pass, so the mean direction is computed once. */
  private fun summarize(members: List<Member>): Summary {
    val centroid = FloatArray(members.first().vector.size)
    members.forEach { member ->
      for (index in 0 until minOf(centroid.size, member.vector.size)) centroid[index] += member.vector[index]
    }
    OfflineImageIntelligence.normalize(centroid)
    val norm = SearchRanker.norm(centroid, 0, centroid.size)
    val similarities = members.map {
      SearchRanker.cosine(centroid, norm, it.vector, 0, minOf(centroid.size, it.vector.size))
    }
    val best = similarities.indices.maxByOrNull { similarities[it] } ?: 0
    return Summary(members, similarities.average().toFloat(), members[best])
  }

  private fun describe(summary: Summary, librarySize: Int, medoidText: String): CollectionSuggestion? {
    val memberIds = summary.members.map { it.row.id }
    val terms = distinctiveTerms(memberIds, librarySize)
    val dominantCategory = summary.members
      .groupingBy { it.row.category }
      .eachCount()
      .maxByOrNull { it.value }
      ?.key
      ?: ScreenshotCategorizer.OTHER

    val lead = terms.firstOrNull()?.first
    val name = when {
      // Nothing distinctive and no category either: an unnameable group is not a suggestion.
      lead == null -> dominantCategory.takeIf { it != ScreenshotCategorizer.OTHER } ?: return null
      lead.equals(dominantCategory, ignoreCase = true) -> dominantCategory
      else -> DistinctiveTerms.displayCase(lead, medoidText)
    }

    return CollectionSuggestion(
      id = "sug_" + name.lowercase().replace(NON_SLUG, "_").trim('_'),
      name = name,
      keywords = terms.take(MAX_KEYWORDS).map { it.first },
      memberIds = memberIds,
      cohesion = summary.cohesion,
      dominantCategory = dominantCategory,
      representativeId = summary.medoid.row.id,
      representativeUri = summary.medoid.row.uri,
      representativeThumbnailPath = summary.medoid.row.thumbnailPath,
    )
  }

  /**
   * Terms that describe this group and not the library. A word has to appear in at least half the
   * members to be about the group at all, and is then weighted against how common it is everywhere
   * else — "settings" or "google" describe the phone, not the cluster.
   */
  private fun distinctiveTerms(memberIds: List<String>, librarySize: Int): List<Pair<String, Float>> {
    val minShared = ceil(memberIds.size * MIN_TERM_SHARE).toInt().coerceAtLeast(2)
    val shared = store.tokenDocumentCounts(memberIds)
      .filterKeys { it.length >= MIN_TERM_LENGTH && it.any(Char::isLetter) }
      .filterValues { it >= minShared }
    if (shared.isEmpty()) return emptyList()

    val global = store.globalDocumentFrequency(shared.keys)
    return shared.entries
      .map { (token, count) ->
        token to DistinctiveTerms.weight(count, memberIds.size, global[token] ?: count, librarySize)
      }
      .filter { it.second >= MIN_DISTINCTIVENESS }
      // Alphabetical tie-break keeps the generated name stable when two terms score identically.
      .sortedWith(compareByDescending<Pair<String, Float>> { it.second }.thenBy { it.first })
  }

  private class Member(val row: SearchRow, val vector: FloatArray)

  private class Summary(val members: List<Member>, val cohesion: Float, val medoid: Member) {
    val size: Int get() = members.size
  }

  private companion object {
    /** Cosine at which two screenshots are the same kind of thing. Tuned against the 192-dim joint
     *  vector: lower merges banking into shopping, higher splits one chat app into two. */
    const val MERGE_THRESHOLD = 0.70f
    const val MIN_CLUSTER_SIZE = 4
    const val MAX_CLUSTERS = 24
    const val MAX_SUGGESTIONS = 6

    /** Bounds the work and the memory: 600 vectors is under half a megabyte of floats. */
    const val SCAN_LIMIT = 600

    const val MIN_TERM_SHARE = 0.5f
    const val MIN_TERM_LENGTH = 3
    const val MIN_DISTINCTIVENESS = 0.35f
    const val MAX_KEYWORDS = 3

    val NON_SLUG = Regex("[^a-z0-9]+")
  }
}

/**
 * Sequential leader clustering, kept separate from the database scan so the algorithm can be tested
 * on plain vectors.
 *
 * Chosen over k-means because it needs no `k` — the number of natural groups in someone's
 * screenshots is precisely what we are trying to discover — converges in a single pass, and is
 * deterministic for a given input order.
 */
object LeaderClustering {
  /** Returns member indices per cluster, in the order the clusters were opened. */
  fun assign(vectors: List<FloatArray>, threshold: Float, maxClusters: Int): List<List<Int>> {
    val clusters = mutableListOf<MutableList<Int>>()
    // Running sums rather than means: cosine is scale-invariant, so no division is ever needed.
    val sums = mutableListOf<FloatArray>()

    vectors.forEachIndexed { index, vector ->
      var best = 0f
      var target = -1
      sums.forEachIndexed { cluster, sum ->
        val similarity = SearchRanker.cosine(
          sum, SearchRanker.norm(sum, 0, sum.size), vector, 0, minOf(sum.size, vector.size),
        )
        if (similarity > best) {
          best = similarity
          target = cluster
        }
      }
      when {
        target >= 0 && best >= threshold -> {
          clusters[target] += index
          val sum = sums[target]
          for (dimension in 0 until minOf(sum.size, vector.size)) sum[dimension] += vector[dimension]
        }
        clusters.size < maxClusters -> {
          clusters += mutableListOf(index)
          sums += vector.copyOf()
        }
        // Past the cap a stray vector is dropped rather than forced into an unrelated group.
        else -> Unit
      }
    }
    return clusters.map { it.toList() }
  }
}

/** Naming arithmetic, separated for the same reason: no database, no Android, directly testable. */
object DistinctiveTerms {
  /**
   * Share of the cluster that carries the term, scaled by its inverse document frequency across the
   * library. A term in every screenshot has a rarity factor of nearly zero however unanimous the
   * cluster is, which is exactly what stops "screenshot" or "settings" from naming everything.
   */
  fun weight(sharedBy: Int, clusterSize: Int, globalDocFrequency: Int, librarySize: Int): Float {
    if (clusterSize <= 0 || librarySize <= 0) return 0f
    val share = sharedBy.toFloat() / clusterSize
    val rarity = ln(librarySize.toDouble() / (1.0 + globalDocFrequency.toDouble())).coerceAtLeast(0.0)
    return (share * rarity).toFloat()
  }

  /**
   * Recovers a term's real casing from the representative image, so a cluster names itself
   * "WhatsApp" rather than "Whatsapp". Text that is entirely uppercase is a banner or a heading
   * rather than a brand's own spelling, so it is title-cased instead of shouted back at the user.
   */
  fun displayCase(term: String, text: String): String {
    val index = text.indexOf(term, ignoreCase = true)
    if (index < 0) return term.replaceFirstChar(Char::titlecase)
    val original = text.substring(index, index + term.length)
    return if (original.any(Char::isLowerCase)) original else original.lowercase().replaceFirstChar(Char::titlecase)
  }
}
