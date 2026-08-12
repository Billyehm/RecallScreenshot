package com.recallai.screenshots

import android.content.Context

/**
 * Durable user choices that steer indexing: what kind of image counts, which folders it may come
 * from, and whether the worker is paused. All live in the same SharedPreferences file the scheduler
 * already owns, so pause state has exactly one home rather than two that can disagree.
 *
 * The two scope choices are independent and compose with AND: [IndexScope] decides what counts as
 * indexable, the folder set decides where Recall may look for it. Keeping them separate is what lets
 * "only screenshots" find captures wherever the device saves them, while a folder choice still
 * narrows within that.
 *
 * Folder selection is stored as the set the user explicitly chose. "Not chosen yet" and "chose
 * nothing" are different states: the first means no folder restriction at all, the second is a
 * deliberate empty scope that indexes nothing and is respected as such.
 */
object RecallIndexPreferences {
  private const val PREFS = "recall-index"
  private const val FOLDERS = "indexed-folders"
  private const val FOLDERS_CHOSEN = "indexed-folders-chosen"
  private const val SCOPE = "index-scope"

  /**
   * What kinds of image Recall is allowed to index. Screenshots only until the user widens it, so
   * reading and processing an entire photo library is always something they opted into.
   *
   * [wireValue] is both the persisted form and the form crossing the React Native bridge, so the
   * stored value and the JS union stay one vocabulary rather than two that can drift apart.
   */
  enum class IndexScope(val wireValue: String) {
    SCREENSHOTS_ONLY("screenshotsOnly"),
    ALL_IMAGES("allImages"),
    ;

    companion object {
      val DEFAULT = SCREENSHOTS_ONLY

      /** Null for anything unrecognised, so callers decide between falling back and rejecting. */
      fun fromWireValue(value: String?): IndexScope? = entries.firstOrNull { it.wireValue == value }
    }
  }

  /** An absent or unrecognised stored value reads as the default: never widen the scope silently. */
  fun indexScope(context: Context): IndexScope =
    IndexScope.fromWireValue(prefs(context).getString(SCOPE, null)) ?: IndexScope.DEFAULT

  fun setIndexScope(context: Context, scope: IndexScope) {
    prefs(context).edit().putString(SCOPE, scope.wireValue).apply()
  }

  /** The folders the user restricted indexing to. Empty and unchosen means every folder. */
  fun indexedFolders(context: Context): Set<String> {
    val prefs = prefs(context)
    if (!prefs.getBoolean(FOLDERS_CHOSEN, false)) return emptySet()
    return prefs.getStringSet(FOLDERS, emptySet())?.toSet() ?: emptySet()
  }

  /** True once the user has made a choice, so an empty set can be told apart from no restriction. */
  fun hasChosenFolders(context: Context): Boolean = prefs(context).getBoolean(FOLDERS_CHOSEN, false)

  fun setIndexedFolders(context: Context, folders: Set<String>) {
    prefs(context).edit()
      .putStringSet(FOLDERS, folders.map(String::lowercase).toSet())
      .putBoolean(FOLDERS_CHOSEN, true)
      .apply()
  }

  /** Drops the folder restriction and forgets that a choice was ever made. */
  fun resetFolders(context: Context) {
    prefs(context).edit().remove(FOLDERS).putBoolean(FOLDERS_CHOSEN, false).apply()
  }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
