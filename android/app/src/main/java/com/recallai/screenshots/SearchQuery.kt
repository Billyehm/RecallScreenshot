package com.recallai.screenshots

import java.util.Calendar

/**
 * A raw search phrase parsed into the parts the ranker can use.
 *
 * Users type instructions, not keywords: *"find my flight ticket from last week"*. Left alone,
 * every word there is a search term, and the three that match nothing useful outnumber the two that
 * matter — coverage scoring then rewards whichever image happens to contain "find". Parsing
 * separates intent from content once, so the token index and the embedding both see only the part
 * that carries meaning.
 *
 * Deliberately free of Android dependencies so it can be unit-tested on the JVM.
 */
data class SearchQuery(
  val raw: String,
  /** Content terms with filler removed. Empty for a phrase like "show me my screenshots". */
  val tokens: List<String>,
  /** Category the phrase points at, or [ScreenshotCategorizer.OTHER] when it names none. */
  val category: String,
  val categoryConfidence: Float,
  /** Half-open epoch-millis window when the phrase names a period; both zero otherwise. */
  val fromMillis: Long,
  val toMillis: Long,
) {
  val hasTerms: Boolean get() = tokens.isNotEmpty()

  val hasDateRange: Boolean get() = toMillis > fromMillis

  val hasCategory: Boolean get() = category != ScreenshotCategorizer.OTHER

  /** The surviving terms as one string — what the embedding and the exact-phrase check see. */
  val phrase: String get() = tokens.joinToString(" ")

  fun withinRange(createdAt: Long): Boolean = hasDateRange && createdAt >= fromMillis && createdAt < toMillis

  companion object {
    val EMPTY = SearchQuery("", emptyList(), ScreenshotCategorizer.OTHER, 0f, 0L, 0L)

    fun parse(raw: String, now: Long): SearchQuery {
      val lowered = raw.lowercase().trim()
      if (lowered.isEmpty()) return EMPTY
      val period = parsePeriod(lowered, now)
      val tokens = OfflineEmbedding.contentTokens(lowered)
        .filterNot(FILLER::contains)
        .filterNot(period.consumed::contains)
        .distinct()
        .take(MAX_TERMS)
      // Reuses the indexer's own keyword tables rather than a second vocabulary, so a query is
      // interpreted with exactly the rules that assigned the categories it is matched against.
      val intent = ScreenshotCategorizer.categorize("", tokens.joinToString(" "), emptyList())
      return SearchQuery(raw.trim(), tokens, intent.category, intent.confidence, period.from, period.to)
    }

    /** Intent for a similarity search, where the source image supplies the category instead. */
    fun forCategory(category: String, confidence: Float): SearchQuery =
      SearchQuery("", emptyList(), category, confidence, 0L, 0L)

    private fun parsePeriod(lowered: String, now: Long): Period {
      RELATIVE_DAYS.find(lowered)?.let { match ->
        val days = match.groupValues[2].toIntOrNull()?.coerceIn(1, MAX_RELATIVE_DAYS)
        if (days != null) return trailingDays(now, days, setOf(match.groupValues[1], "day", "days"))
      }
      return when {
        lowered.contains("yesterday") -> dayRange(now, -1, setOf("yesterday"))
        lowered.contains("today") -> dayRange(now, 0, setOf("today"))
        lowered.contains("last week") -> weekRange(now, -1, setOf("last", "week"))
        lowered.contains("this week") -> weekRange(now, 0, setOf("this", "week"))
        lowered.contains("last month") -> monthRange(now, -1, setOf("last", "month"))
        lowered.contains("this month") -> monthRange(now, 0, setOf("this", "month"))
        lowered.contains("last year") -> yearRange(now, -1, setOf("last", "year"))
        lowered.contains("this year") -> yearRange(now, 0, setOf("this", "year"))
        // Checked last so "recent" never shadows a phrase that names an exact period.
        lowered.contains("recent") -> trailingDays(now, RECENT_DAYS, setOf("recent", "recently"))
        else -> Period.NONE
      }
    }

    private fun dayStart(now: Long): Calendar = Calendar.getInstance().apply {
      timeInMillis = now
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }

    /** Calendar arithmetic rather than millisecond offsets, so daylight-saving shifts stay exact. */
    private fun span(start: Calendar, field: Int, amount: Int, consumed: Set<String>): Period {
      val end = (start.clone() as Calendar).apply { add(field, amount) }
      return Period(start.timeInMillis, end.timeInMillis, consumed)
    }

    private fun dayRange(now: Long, offsetDays: Int, consumed: Set<String>): Period =
      span(dayStart(now).apply { add(Calendar.DAY_OF_YEAR, offsetDays) }, Calendar.DAY_OF_YEAR, 1, consumed)

    /** Inclusive of today, so "last 7 days" covers today plus the six before it. */
    private fun trailingDays(now: Long, days: Int, consumed: Set<String>): Period =
      span(dayStart(now).apply { add(Calendar.DAY_OF_YEAR, -(days - 1)) }, Calendar.DAY_OF_YEAR, days, consumed)

    private fun weekRange(now: Long, offsetWeeks: Int, consumed: Set<String>): Period {
      val start = dayStart(now).apply {
        add(Calendar.DAY_OF_YEAR, -((get(Calendar.DAY_OF_WEEK) - firstDayOfWeek + DAYS_PER_WEEK) % DAYS_PER_WEEK))
        add(Calendar.WEEK_OF_YEAR, offsetWeeks)
      }
      return span(start, Calendar.WEEK_OF_YEAR, 1, consumed)
    }

    private fun monthRange(now: Long, offsetMonths: Int, consumed: Set<String>): Period {
      val start = dayStart(now).apply {
        set(Calendar.DAY_OF_MONTH, 1)
        add(Calendar.MONTH, offsetMonths)
      }
      return span(start, Calendar.MONTH, 1, consumed)
    }

    private fun yearRange(now: Long, offsetYears: Int, consumed: Set<String>): Period {
      val start = dayStart(now).apply {
        set(Calendar.DAY_OF_YEAR, 1)
        add(Calendar.YEAR, offsetYears)
      }
      return span(start, Calendar.YEAR, 1, consumed)
    }

    private const val MAX_TERMS = 8
    private const val MAX_RELATIVE_DAYS = 365
    private const val RECENT_DAYS = 30
    private const val DAYS_PER_WEEK = 7

    private val RELATIVE_DAYS = Regex("(last|past)\\s+(\\d{1,3})\\s+days?")

    /**
     * Words that express *how* the user is asking rather than *what* for. Kept separate from
     * [OfflineEmbedding] stopwords on purpose: "find" and "show" are pure noise in a query but can
     * be genuine recognized text inside an image, so they must not be stripped at index time.
     */
    private val FILLER = setOf(
      "find", "finding", "search", "searching", "show", "showing", "give", "get", "fetch", "open",
      "display", "list", "locate", "look", "looking", "want", "need", "see", "view", "please",
      "me", "my", "mine", "myself", "anything", "everything", "something", "stuff",
      "pic", "pics", "snap", "snaps", "gallery",
    )
  }
}

/** Result of reading a time phrase: the window it names, and the words it used up. */
private class Period(val from: Long, val to: Long, val consumed: Set<String>) {
  companion object {
    val NONE = Period(0L, 0L, emptySet())
  }
}
