import { executeSql } from "../../../core/database/sqliteDatabase";
import { colors } from "../../../shared/theme/colors";
import type { Screenshot } from "../../../shared/types/recall";
import { formatRelativeTime } from "../../../shared/utils/relativeTime";
import { ScreenshotMediaStore, type ImageSearchResult, type NativeSearchFilters } from "../../screenshots/native/ScreenshotMediaStore";
import type { SearchRepository } from "../domain/searchRepository";
import { hasActiveFilters, type SearchFilters, type SearchHit, type SearchRequest } from "../domain/searchResult";

const DEFAULT_LIMIT = 40;

/**
 * Ranking runs natively, against the same SQLite file this connection opens: the index is streamed
 * with a bounded candidate heap, which is not something the JS bridge could do without pulling every
 * embedding across it. This repository owns only the parts JS is better at — shaping results for the
 * UI, and writing the search statistics the ranker reads back.
 */
export class NativeSearchRepository implements SearchRepository {
  async search({ query, category, filters, limit = DEFAULT_LIMIT }: SearchRequest): Promise<SearchHit[]> {
    const results = await ScreenshotMediaStore.searchText(query, toNativeFilters(category, filters), limit);
    return results.map(toHit);
  }

  async findSimilar(contentUri: string, limit = DEFAULT_LIMIT): Promise<SearchHit[]> {
    const results = await ScreenshotMediaStore.searchSimilar(contentUri, limit);
    return results.map(toHit);
  }

  async recordSearch(query: string, resultIds: string[]) {
    const trimmed = query.trim();
    if (!trimmed) return;

    const now = Date.now();
    try {
      await executeSql("INSERT INTO search_history (id, query, result_count, created_at) VALUES (?, ?, ?, ?)", [
        `sh_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        trimmed,
        resultIds.length,
        now
      ]);

      if (resultIds.length) {
        // Re-finding an image is the signal worth keeping; the ranker weighs it above an
        // incidental open.
        await executeSql(
          `UPDATE screenshot_metadata
           SET search_count = search_count + 1
           WHERE id IN (${resultIds.map(() => "?").join(",")})`,
          resultIds
        );
      }
    } catch {
      // Search statistics are an optimization. Losing one must never surface as a failed search.
    }
  }
}

/**
 * The category chip and the filter panel can both name a category. The panel wins when it is set,
 * because it is the more specific of the two — the chip is a browsing shortcut, the panel is a
 * deliberate narrowing. Returns null when nothing is being filtered, which lets the native side skip
 * its per-row filter check entirely.
 */
function toNativeFilters(category?: string, filters?: SearchFilters): NativeSearchFilters | null {
  const merged: SearchFilters = { ...filters, category: filters?.category || category || undefined };
  if (!hasActiveFilters(merged)) return null;
  return merged;
}

function toHit(result: ImageSearchResult): SearchHit {
  return { screenshot: toScreenshot(result), score: result.score, matchedTerms: result.matchedTerms ?? [] };
}

function toScreenshot(result: ImageSearchResult): Screenshot {
  return {
    id: result.id,
    title: result.title,
    source: result.source,
    time: formatRelativeTime(result.createdAt),
    accent: colors.primary,
    icon: "image",
    // Same rule as the gallery: lists render the cached thumbnail, the viewer loads the original.
    uri: result.thumbnailUri ?? result.uri,
    fullUri: result.uri,
    createdAt: result.createdAt,
    modifiedAt: result.modifiedAt,
    size: result.size,
    width: result.width,
    height: result.height,
    category: result.category,
    categoryConfidence: result.categoryConfidence,
    tags: result.tags ?? [],
    ocrText: result.ocrText,
    ocrConfidence: result.ocrConfidence,
    ocrLanguage: result.ocrLanguage,
    // A search result is by definition indexed; collection membership is resolved by the viewer.
    isIndexed: true
  };
}
