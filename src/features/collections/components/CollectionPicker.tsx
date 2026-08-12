import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";
import { LayoutToggle } from "../../library/components/LayoutToggle";
import { ScreenshotBrowser } from "../../library/components/ScreenshotBrowser";
import { useLibraryLayout } from "../../library/hooks/useLibraryLayout";
import { useScreenshotGallery } from "../../screenshots/hooks/useScreenshotGallery";

type CollectionPickerProps = {
  visible: boolean;
  onClose: () => void;
  collectionName: string;
  /** Ids already filed here, so the picker opens showing current membership rather than empty. */
  memberIds: string[];
  /** Receives only what changed; an unchanged selection is never written. */
  onSave: (change: { added: string[]; removed: string[] }) => Promise<unknown>;
  isSaving: boolean;
};

/**
 * Multi-select over the whole library for editing one category's membership.
 *
 * Selection is held locally and diffed against [memberIds] on save, so tapping an image on and off
 * again costs nothing, and one save writes one batch rather than a statement per tap.
 */
export function CollectionPicker({
  visible,
  onClose,
  collectionName,
  memberIds,
  onSave,
  isSaving
}: CollectionPickerProps) {
  const { colors, styles } = useTheme();
  const { layout, chooseLayout } = useLibraryLayout();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set(memberIds));

  const { screenshots, loadMore, isFetchingNextPage } = useScreenshotGallery();

  // Re-seeded each time the picker opens so a cancelled edit does not carry into the next open.
  useEffect(() => {
    if (visible) setSelectedIds(new Set(memberIds));
  }, [memberIds, visible]);

  const toggle = useCallback((shot: Screenshot) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (!next.delete(shot.id)) next.add(shot.id);
      return next;
    });
  }, []);

  const change = useMemo(() => {
    const members = new Set(memberIds);
    return {
      added: [...selectedIds].filter((id) => !members.has(id)),
      removed: memberIds.filter((id) => !selectedIds.has(id))
    };
  }, [memberIds, selectedIds]);

  const changeCount = change.added.length + change.removed.length;

  const save = async () => {
    try {
      if (changeCount) await onSave(change);
      onClose();
    } catch {
      // The caller reports the failure. The picker stays open holding the selection, so the save is
      // retryable rather than something the user has to reconstruct.
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.fullScreenModal}>
        <View style={styles.modalTopBar}>
          <Pressable accessibilityLabel="Cancel" accessibilityRole="button" onPress={onClose} style={styles.modalCloseButton}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.flexOne}>
            <Text numberOfLines={1} style={styles.viewerTitle}>
              Add to {collectionName}
            </Text>
            <Text style={styles.bodyMuted}>
              {selectedIds.size} selected
              {changeCount ? ` · ${changeCount} change${changeCount === 1 ? "" : "s"}` : ""}
            </Text>
          </View>
          <LayoutToggle layout={layout} onChange={chooseLayout} />
        </View>

        <ScreenshotBrowser
          emptyBody="Images from your device appear here once Recall has indexed them."
          emptyTitle="No images yet"
          isFetchingNextPage={isFetchingNextPage}
          layout={layout}
          onEndReached={loadMore}
          onPress={toggle}
          screenshots={screenshots}
          selectedIds={selectedIds}
        />

        <View style={[styles.modalTopBar, styles.pickerActionBar]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedIds(new Set())}
            style={[styles.subtleButton, styles.sheetFooterButton]}
          >
            <Text style={styles.subtleButtonText}>Clear</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={save}
            style={[styles.primaryButton, styles.sheetFooterButton, isSaving && styles.buttonDisabled]}
          >
            {isSaving ? <ActivityIndicator color={colors.onPrimary} size="small" /> : null}
            <Text style={styles.primaryButtonText}>{changeCount ? `Save ${changeCount}` : "Done"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
