import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Alert } from "react-native";

import { queryKeys } from "../../../shared/utils/queryKeys";
import { screenshotService } from "../services/screenshotService";

type ScreenshotActionOptions = {
  /** Called after a confirmed delete, so the viewer showing the image can close itself. */
  onDeleted?: () => void;
};

/**
 * Delete and share, for a single image or a selection.
 *
 * Delete is confirmed twice on purpose and neither dialog is redundant: ours states what will happen
 * in the app's own words, and from Android 11 the platform adds its own dialog that no app can
 * suppress. A false result means the user declined the second one, which is not an error.
 */
export function useScreenshotActions({ onDeleted }: ScreenshotActionOptions = {}) {
  const queryClient = useQueryClient();

  // The images are gone from both MediaStore and the index, so every listing that could still be
  // showing them is stale — including search results and the counts derived from them.
  const invalidateAfterDelete = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.screenshots }),
        queryClient.invalidateQueries({ queryKey: queryKeys.search }),
        queryClient.invalidateQueries({ queryKey: queryKeys.collections })
      ]),
    [queryClient]
  );

  const remove = useMutation({
    mutationFn: (contentUri: string) => screenshotService.deleteScreenshot(contentUri),
    onSuccess: async (deleted) => {
      if (!deleted) return;
      await invalidateAfterDelete();
      onDeleted?.();
    },
    onError: (error: Error) => {
      Alert.alert("Could not delete", error.message);
    }
  });

  const removeMany = useMutation({
    mutationFn: (contentUris: string[]) => screenshotService.deleteScreenshots(contentUris),
    onError: (error: Error) => {
      Alert.alert("Could not delete", error.message);
    }
  });

  const share = useMutation({
    mutationFn: ({ contentUri, mimeType }: { contentUri: string; mimeType?: string }) =>
      screenshotService.shareScreenshot(contentUri, mimeType),
    onError: (error: Error) => {
      Alert.alert("Could not share", error.message);
    }
  });

  const shareBatch = useMutation({
    mutationFn: (contentUris: string[]) => screenshotService.shareScreenshots(contentUris),
    onError: (error: Error) => {
      Alert.alert("Could not share", error.message);
    }
  });

  const confirmDelete = useCallback(
    (contentUri: string, title?: string) => {
      Alert.alert(
        "Delete image?",
        `${title ? `"${title}" ` : "This image "}will be removed from your device. This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => remove.mutate(contentUri) }
        ]
      );
    },
    [remove]
  );

  /**
   * Multi-select delete.
   *
   * One native call for the whole selection, not a loop: `createDeleteRequest` takes the full URI
   * list, so the platform raises a single confirmation covering every image. Deleting one at a time
   * would prompt once per image and, because the module holds only one pending delete, reject every
   * request after the first.
   *
   * [onFinished] runs only after a confirmed delete, so declining the system dialog leaves the
   * selection intact rather than silently clearing it.
   */
  const confirmDeleteMany = useCallback(
    (shots: Array<{ fullUri?: string; uri?: string }>, onFinished?: () => void) => {
      const uris = shots.map((shot) => shot.fullUri ?? shot.uri).filter((uri): uri is string => Boolean(uri));
      if (uris.length === 0) return;

      Alert.alert(
        uris.length === 1 ? "Delete image?" : `Delete ${uris.length} images?`,
        `${uris.length === 1 ? "This image" : "These images"} will be removed from your device. This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              removeMany.mutate(uris, {
                onSuccess: async (deleted) => {
                  if (!deleted) return;
                  await invalidateAfterDelete();
                  onFinished?.();
                }
              });
            }
          }
        ]
      );
    },
    [invalidateAfterDelete, removeMany]
  );

  const shareMany = useCallback(
    (shots: Array<{ fullUri?: string; uri?: string }>) => {
      const uris = shots.map((shot) => shot.fullUri ?? shot.uri).filter((uri): uri is string => Boolean(uri));
      if (uris.length === 0) return;
      shareBatch.mutate(uris);
    },
    [shareBatch]
  );

  return {
    confirmDelete,
    confirmDeleteMany,
    shareScreenshot: (contentUri: string, mimeType?: string) => share.mutate({ contentUri, mimeType }),
    shareMany,
    isDeleting: remove.isPending || removeMany.isPending,
    isSharing: share.isPending || shareBatch.isPending
  };
}
