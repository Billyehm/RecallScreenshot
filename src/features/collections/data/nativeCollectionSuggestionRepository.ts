import { ScreenshotMediaStore, type NativeCollectionSuggestion } from "../../screenshots/native/ScreenshotMediaStore";
import type { CollectionSuggestion, CollectionSuggestionRepository } from "../domain/collectionSuggestion";

/**
 * Clustering runs natively: it scans embeddings and the membership table in the same database file,
 * which keeps a few hundred vectors off the JS thread entirely.
 */
export class NativeCollectionSuggestionRepository implements CollectionSuggestionRepository {
  async suggest(limit: number): Promise<CollectionSuggestion[]> {
    const suggestions = await ScreenshotMediaStore.suggestCollections(limit);
    return suggestions.map(toSuggestion);
  }
}

function toSuggestion(suggestion: NativeCollectionSuggestion): CollectionSuggestion {
  return {
    id: suggestion.id,
    name: suggestion.name,
    keywords: suggestion.keywords,
    memberIds: suggestion.memberIds,
    size: suggestion.size,
    cohesion: suggestion.cohesion,
    category: suggestion.category,
    representativeId: suggestion.representativeId,
    // The thumbnail is the cheap render; the original is only a fallback for a reclaimed cache.
    representativeUri: suggestion.representativeThumbnailUri ?? suggestion.representativeUri
  };
}
