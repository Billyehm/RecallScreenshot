import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { collectionService } from "../services/collectionService";

/**
 * Collections and screenshot listings share membership state, so both are invalidated whenever
 * membership changes. Without that, a collection's tile count and its contents drift apart.
 */
export function useCollectionLibrary() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.collections }),
      queryClient.invalidateQueries({ queryKey: queryKeys.screenshots })
    ]);
  }, [queryClient]);

  const collections = useQuery({
    queryKey: queryKeys.collections,
    queryFn: () => collectionService.list(),
    initialData: []
  });

  const create = useMutation({
    mutationFn: (name: string) => collectionService.create(name),
    onSuccess: invalidate
  });

  const remove = useMutation({
    mutationFn: (id: string) => collectionService.remove(id),
    onSuccess: invalidate
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => collectionService.rename(id, name),
    onSuccess: invalidate
  });

  const setMembership = useMutation({
    mutationFn: ({ collectionId, screenshotId, member }: { collectionId: string; screenshotId: string; member: boolean }) =>
      member
        ? collectionService.addScreenshot(collectionId, screenshotId)
        : collectionService.removeScreenshot(collectionId, screenshotId),
    onSuccess: invalidate
  });

  /**
   * Commits a whole selection at once. Adds and removes are separate statements but one
   * invalidation, so the grid does not reload between the two halves of a single edit.
   */
  const setBatchMembership = useMutation({
    mutationFn: async ({ collectionId, added, removed }: { collectionId: string; added: string[]; removed: string[] }) => {
      if (added.length) await collectionService.addScreenshots(collectionId, added);
      if (removed.length) await collectionService.removeScreenshots(collectionId, removed);
    },
    onSuccess: invalidate
  });

  return {
    collections: collections.data,
    isLoading: collections.isLoading,
    createCollection: create.mutateAsync,
    renameCollection: rename.mutateAsync,
    removeCollection: remove.mutateAsync,
    setMembership: setMembership.mutateAsync,
    setBatchMembership: setBatchMembership.mutateAsync,
    isMutating:
      create.isPending || remove.isPending || rename.isPending || setMembership.isPending || setBatchMembership.isPending
  };
}
