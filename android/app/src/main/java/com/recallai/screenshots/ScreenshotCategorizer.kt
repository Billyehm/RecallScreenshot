package com.recallai.screenshots

data class CategoryResult(
  val category: String,
  /** Descending-relevance keyword hits, persisted as a JSON array. */
  val tags: List<String>,
  /** 0..1 share of evidence pointing at the winning category. */
  val confidence: Float,
)

/**
 * Keyword scoring over the OCR text, file name and ML Kit image labels. Deliberately rule-based:
 * a bundled classifier would add tens of megabytes to the APK for a fixed, well-known label set,
 * and rules stay debuggable and instant on mid-range hardware.
 */
object ScreenshotCategorizer {
  const val OTHER = "Other"

  /**
   * Weighted so a single unambiguous term ("iban") outranks several generic ones ("app", "screen").
   * Order is stable, which keeps ties deterministic across runs.
   */
  private val categories: Map<String, Map<String, Float>> = linkedMapOf(
    "Banking" to weighted(
      strong = setOf("iban", "swift", "overdraft", "statement", "payee", "mortgage", "creditcard", "debitcard"),
      normal = setOf("bank", "balance", "payment", "invoice", "receipt", "transfer", "transaction", "deposit", "withdrawal", "loan", "billing", "paypal", "crypto", "wallet", "currency", "refund", "salary", "tax", "budget", "atm"),
    ),
    "Social" to weighted(
      strong = setOf("instagram", "facebook", "tiktok", "linkedin", "reddit", "snapchat", "pinterest", "followers"),
      normal = setOf("social", "twitter", "profile", "post", "story", "reel", "feed", "tweet", "retweet", "hashtag", "follow", "share", "timeline", "friend"),
    ),
    "Messaging" to weighted(
      strong = setOf("whatsapp", "telegram", "imessage", "messenger", "signal", "discord"),
      normal = setOf("message", "chat", "sms", "reply", "typing", "conversation", "inbox", "voicemail", "delivered", "unread", "call", "contact"),
    ),
    "Work" to weighted(
      strong = setOf("slack", "jira", "confluence", "standup", "zoom", "teams", "onboarding", "payslip"),
      normal = setOf("work", "meeting", "project", "calendar", "task", "team", "presentation", "deadline", "agenda", "report", "client", "invoice", "sprint", "manager", "office", "email"),
    ),
    "Documents" to weighted(
      strong = setOf("passport", "notarized", "affidavit", "visa", "identitycard"),
      normal = setOf("document", "pdf", "form", "contract", "certificate", "letter", "license", "signature", "agreement", "policy", "terms", "scan", "attachment", "signed", "official"),
    ),
    "Shopping" to weighted(
      strong = setOf("amazon", "checkout", "addtocart", "aliexpress", "etsy", "coupon"),
      normal = setOf("shop", "cart", "order", "delivery", "product", "price", "sale", "store", "discount", "shipping", "tracking", "purchase", "buy", "wishlist", "size", "stock"),
    ),
    "Education" to weighted(
      strong = setOf("university", "syllabus", "semester", "coursera", "thesis", "transcript"),
      normal = setOf("education", "course", "lesson", "school", "exam", "study", "tutorial", "quiz", "assignment", "homework", "lecture", "grade", "student", "college", "chapter", "textbook"),
    ),
    "Programming" to weighted(
      strong = setOf("github", "stacktrace", "stackoverflow", "localhost", "npm", "gradle", "kotlin", "typescript", "python", "javascript", "docker", "kubernetes", "compiler"),
      normal = setOf("code", "function", "error", "exception", "commit", "branch", "merge", "pull", "repository", "terminal", "console", "debug", "api", "json", "sql", "build", "deploy", "variable", "import", "null", "async", "class"),
    ),
    "Entertainment" to weighted(
      strong = setOf("netflix", "youtube", "spotify", "twitch", "playstation", "steam", "podcast"),
      normal = setOf("entertainment", "movie", "music", "game", "video", "stream", "show", "episode", "season", "album", "playlist", "trailer", "player", "score", "watch"),
    ),
    "Travel" to weighted(
      strong = setOf("boardingpass", "airbnb", "booking", "itinerary", "checkin", "gate", "terminal"),
      normal = setOf("travel", "hotel", "flight", "reservation", "airport", "ticket", "trip", "map", "train", "bus", "departure", "arrival", "luggage", "passenger", "route", "destination", "taxi"),
    ),
  )

  fun categorize(fileName: String, ocrText: String, labels: List<String>): CategoryResult {
    val tokens = OfflineEmbedding.tokenize("$fileName ${ocrText.take(MAX_OCR_CHARS)} ${labels.joinToString(" ")}")
    if (tokens.isEmpty()) return CategoryResult(OTHER, emptyList(), 0f)

    val counts = tokens.groupingBy { it }.eachCount()
    val matches = LinkedHashMap<String, MutableList<Pair<String, Float>>>()
    var totalWeight = 0f

    for ((category, keywords) in categories) {
      for ((keyword, weight) in keywords) {
        val occurrences = counts[keyword] ?: continue
        // Saturating: a word repeated 50 times is not 50x the evidence.
        val score = weight * (1f + minOf(occurrences - 1, MAX_BONUS_OCCURRENCES) * REPEAT_BONUS)
        matches.getOrPut(category) { mutableListOf() } += keyword to score
        totalWeight += score
      }
    }

    val winner = matches.maxByOrNull { entry -> entry.value.sumOf { it.second.toDouble() } }
      ?: return CategoryResult(OTHER, emptyList(), 0f)
    val winnerWeight = winner.value.sumOf { it.second.toDouble() }.toFloat()

    return CategoryResult(
      category = winner.key,
      tags = winner.value.sortedByDescending { it.second }.map { it.first }.distinct().take(MAX_TAGS),
      confidence = if (totalWeight <= 0f) 0f else (winnerWeight / totalWeight).coerceIn(0f, 1f),
    )
  }

  /** Every keyword the categorizer knows, used to seed the semantic embedding for a category. */
  fun keywordsFor(category: String): Set<String> = categories[category]?.keys ?: emptySet()

  private fun weighted(strong: Set<String>, normal: Set<String>): Map<String, Float> =
    LinkedHashMap<String, Float>().apply {
      strong.forEach { put(it, STRONG_WEIGHT) }
      normal.forEach { putIfAbsent(it, NORMAL_WEIGHT) }
    }

  private const val STRONG_WEIGHT = 2.5f
  private const val NORMAL_WEIGHT = 1f
  private const val REPEAT_BONUS = 0.15f
  private const val MAX_BONUS_OCCURRENCES = 4
  private const val MAX_TAGS = 8
  private const val MAX_OCR_CHARS = 4000
}
