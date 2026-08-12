import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { collectionService } from "../services/collectionService";

const NO_MEMBERS: string[] = [];

/**
 * Ids filed under one category.
 *
 * The picker needs the full membership, not the page of it the gallery happens to have loaded —
 * saving a diff against a partial list would unfile everything that had not been paged in yet.
 */
export function useCollectionMembers(collectionId?: string) {
  const members = useQuery({
    queryKey: queryKeys.collectionMembers(collectionId ?? ""),
    queryFn: () => collectionService.listScreenshotIds(collectionId as string),
    enabled: Boolean(collectionId)
  });

  return members.data ?? NO_MEMBERS;
}
