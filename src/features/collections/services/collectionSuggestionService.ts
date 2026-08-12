import { keyValueStorage, type KeyValueStorage } from "../../../core/storage/keyValueStorage";
import { NativeCollectionSuggestionRepository } from "../data/nativeCollectionSuggestionRepository";
import type { CollectionSuggestion, CollectionSuggestionRepository } from "../domain/collectionSuggestion";

const DISMISSED_KEY = "collections.dismissedSuggestions";
const DEFAULT_LIMIT = 3;

/**
 * How many suggestions are kept. Dismissals are stored by cluster id, and clusters change as the
 * library grows, so the list is trimmed to stop it accumulating ids for groups that no longer exist.
 */
const MAX_DISMISSALS = 60;

export class CollectionSuggestionService {
  constructor(
    private readonly repository: CollectionSuggestionRepository,
    private readonly storage: KeyValueStorage
  ) {}

  /** Suggestions the user has not dismissed, strongest cluster first. */
  async suggest(limit = DEFAULT_LIMIT): Promise<CollectionSuggestion[]> {
    const dismissed = this.readDismissed();
    // Over-fetches so dismissed clusters do not shrink the card count below what was asked for.
    const suggestions = await this.repository.suggest(limit + dismissed.length);
    return suggestions.filter((suggestion) => !dismissed.includes(suggestion.id)).slice(0, limit);
  }

  dismiss(suggestionId: string) {
    const dismissed = this.readDismissed().filter((id) => id !== suggestionId);
    dismissed.push(suggestionId);
    this.storage.setString(DISMISSED_KEY, JSON.stringify(dismissed.slice(-MAX_DISMISSALS)));
  }

  private readDismissed(): string[] {
    const raw = this.storage.getString(DISMISSED_KEY);
    if (!raw) return [];

    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      // Unreadable preferences are worth less than a working screen: start over rather than throw.
      return [];
    }
  }
}

export const collectionSuggestionService = new CollectionSuggestionService(
  new NativeCollectionSuggestionRepository(),
  keyValueStorage
);
