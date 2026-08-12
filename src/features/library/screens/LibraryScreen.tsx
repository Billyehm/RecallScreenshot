import React, { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";
import { ScreenshotViewer } from "../../screenshots/components/ScreenshotViewer";
import { useScreenshotActions } from "../../screenshots/hooks/useScreenshotActions";
import { useScreenshotGallery } from "../../screenshots/hooks/useScreenshotGallery";
import { LayoutToggle } from "../components/LayoutToggle";
import { ScreenshotBrowser } from "../components/ScreenshotBrowser";
import { useLibraryLayout } from "../hooks/useLibraryLayout";

type LibraryScreenProps = {
  visible: boolean;
  onClose: () => void;
  /** Pre-applied category, so "see more" from a filtered home view stays filtered. */
  category?: string;
};

/**
 * Every indexed image, in grid or list. Presented as a full-screen modal rather than a tab because
 * it is a drill-down from Home, and the project has no stack navigator to push onto.
 *
 * Paging is the gallery hook's, so the library shares one cache with Home instead of maintaining a
 * second copy of the same pages.
 */
export function LibraryScreen({ visible, onClose, category }: LibraryScreenProps) {
  const { colors, styles } = useTheme();
  const { layout, chooseLayout } = useLibraryLayout();
  const [openedShot, setOpenedShot] = useState<Screenshot | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const { screenshots, loadMore, isFetchingNextPage } = useScreenshotGallery({ filter: { category } });
  const { confirmDeleteMany, shareMany, isDeleting } = useScreenshotActions();

  const selectionCount = selectedIds.size;
  const inSelection = selectionCount > 0;

  const toggleSelected = useCallback((shot: Screenshot) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(shot.id)) next.delete(shot.id);
      else next.add(shot.id);
      return next;
    });
  }, []);

  const closeSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Resolved from ids at action time rather than stored alongside them, so a selected image that
  // paged out and back cannot go stale.
  const selected = useMemo(
    () => screenshots.filter((shot) => selectedIds.has(shot.id)),
    [screenshots, selectedIds]
  );

  return (
    <Modal animationType="slide" onRequestClose={inSelection ? closeSelection : onClose} visible={visible}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.fullScreenModal}>
        {inSelection ? (
          <View style={styles.modalTopBar}>
            <Pressable
              accessibilityLabel="Exit selection"
              accessibilityRole="button"
              onPress={closeSelection}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
            <View style={styles.flexOne}>
              <Text numberOfLines={1} style={styles.viewerTitle}>
                {selectionCount} selected
              </Text>
            </View>
            <Pressable
              accessibilityLabel={`Share ${selectionCount} images`}
              accessibilityRole="button"
              onPress={() => shareMany(selected)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="share-social-outline" size={20} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityLabel={`Delete ${selectionCount} images`}
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={() => confirmDeleteMany(selected, closeSelection)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="trash-outline" size={20} color={colors.tertiary} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.modalTopBar}>
            <Pressable accessibilityLabel="Close library" accessibilityRole="button" onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </Pressable>
            <View style={styles.flexOne}>
              <Text numberOfLines={1} style={styles.viewerTitle}>
                {category ?? "All images"}
              </Text>
              <Text style={styles.bodyMuted}>
                {screenshots.length}
                {isFetchingNextPage ? "+" : ""} indexed
              </Text>
            </View>
            <LayoutToggle layout={layout} onChange={chooseLayout} />
          </View>
        )}

        <ScreenshotBrowser
          emptyBody={
            category
              ? "Nothing in this category yet. Images appear as the indexer classifies them."
              : "Images from your device appear here once Recall has indexed them."
          }
          emptyTitle={category ? "No images in this category" : "No images yet"}
          isFetchingNextPage={isFetchingNextPage}
          layout={layout}
          onEndReached={loadMore}
          onLongPress={toggleSelected}
          onPress={inSelection ? toggleSelected : setOpenedShot}
          screenshots={screenshots}
          selectedIds={inSelection ? selectedIds : undefined}
        />

        <ScreenshotViewer screenshots={screenshots} onClose={() => setOpenedShot(null)} onOpenRelated={setOpenedShot} screenshot={openedShot} />
      </SafeAreaView>
    </Modal>
  );
}
