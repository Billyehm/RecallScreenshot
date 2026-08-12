/**
 * A group of unfiled images the on-device clustering found together, with everything the card needs
 * to explain itself. Name, keywords and representative image are all derived from the cluster's own
 * content — none of them are fixed in code.
 */
export type CollectionSuggestion = {
  /** Stable for the same cluster content, so a dismissal survives a restart. */
  id: string;
  /** Generated from the terms that distinguish this cluster from the rest of the library. */
  name: string;
  /** The terms behind the name, best first. Shown so the user can judge the grouping. */
  keywords: string[];
  memberIds: string[];
  size: number;
  /** Mean cosine to the cluster centre: how tightly these images actually belong together. */
  cohesion: number;
  /** Dominant category, used as the name fallback when no term is distinctive enough. */
  category: string;
  /** Medoid — the member closest to the cluster centre, so it represents the group. */
  representativeId: string;
  /** Thumbnail when the platform still has one cached, otherwise the original. */
  representativeUri: string;
};

export interface CollectionSuggestionRepository {
  /** Clusters unfiled images. Returns at most [limit] suggestions, strongest first. */
  suggest(limit: number): Promise<CollectionSuggestion[]>;
}
