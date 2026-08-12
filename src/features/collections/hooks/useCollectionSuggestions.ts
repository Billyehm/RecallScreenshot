import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { queryKeys } from "../../../shared/utils/queryKeys";
import type { CollectionSuggestion } from "../domain/collectionSuggestion";
import { collectionService } from "../services/collectionService";
import { collectionSuggestionService } from "../services/collectionSuggestionService";

type FileIntoExisting = {
  collectionId: string;
  suggestion: CollectionSuggestion;
};

/**
 * Suggested groupings plus the two things a user can do with one: keep it as a new collection, or
 * fold it into a collection they already have.
 *
 * Both actions invalidate collections and screenshots, which reaches the suggestions too — their key
 * sits under the collections key. That is deliberate: filing a cluster takes its members out of the
 * unfiled pool, so leaving the card up would offer an action that is now a no-op.
 */
export function useCollectionSuggestions(limit?: number) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.collections }),
      queryClient.invalidateQueries({ queryKey: queryKeys.screenshots })
    ]);
  }, [queryClient]);

  const suggestions = useQuery({
    queryKey: queryKeys.collectionSuggestions,
    queryFn: () => collectionSuggestionService.suggest(limit),
    // Clustering scans a few hundred vectors, so it is not something to redo on every remount.
    // No `initialData` here: seeding a value would count as a fresh fetch and hold the first real
    // one back for the whole stale window.
    staleTime: 5 * 60_000
  });

  const create = useMutation({
    mutationFn: (suggestion: CollectionSuggestion) =>
      collectionService.createWithScreenshots(suggestion.name, suggestion.memberIds),
    onSuccess: invalidate
  });

  const merge = useMutation({
    mutationFn: ({ collectionId, suggestion }: FileIntoExisting) =>
      collectionService.addScreenshots(collectionId, suggestion.memberIds),
    onSuccess: invalidate
  });

  const dismiss = useCallback(
    async (suggestionId: string) => {
      collectionSuggestionService.dismiss(suggestionId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.collectionSuggestions });
    },
    [queryClient]
  );

  return {
    suggestions: suggestions.data ?? [],
    isLoading: suggestions.isLoading,
    createFromSuggestion: create.mutateAsync,
    mergeIntoCollection: merge.mutateAsync,
    dismissSuggestion: dismiss,
    isFiling: create.isPending || merge.isPending
  };
}
