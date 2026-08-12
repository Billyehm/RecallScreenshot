import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import { formatCount } from "../../../shared/utils/formatBytes";
import type { MediaFolder } from "../../screenshots/native/ScreenshotMediaStore";

type FolderScopeSheetProps = {
  visible: boolean;
  onClose: () => void;
  folders: MediaFolder[];
  isLoading: boolean;
  /** Resolves once the new scope is stored and the rescan has been queued. */
  onSave: (folders: string[]) => Promise<unknown>;
  isSaving: boolean;
};

/**
 * Chooses which device folders Recall is allowed to index.
 *
 * Held as a draft and written once on save, like the search filters and for a sharper reason:
 * narrowing the scope retires the rows for images that fall outside it, so each intermediate
 * selection on the way to the intended one would delete and re-index work.
 */
export function FolderScopeSheet({ visible, onClose, folders, isLoading, onSave, isSaving }: FolderScopeSheetProps) {
  const { colors, styles } = useTheme();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  // Re-seeded from the device each open, so a cancelled edit does not carry into the next one.
  useEffect(() => {
    if (visible) setSelected(new Set(folders.filter((folder) => folder.isIndexed).map((folder) => folder.name)));
  }, [folders, visible]);

  const toggle = (name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  };

  const save = async () => {
    try {
      await onSave([...selected]);
      onClose();
    } catch {
      // The screen reports the failure. Staying open keeps the selection so it can be retried.
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetLayer}>
        <Pressable accessibilityLabel="Dismiss folders" accessibilityRole="button" onPress={onClose} style={styles.modalScrim} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>Folders to index</Text>
              <Text style={styles.bodyMuted}>
                Recall only reads the folders you pick here. Everything else on the device is left alone.
              </Text>
            </View>
            <Pressable accessibilityLabel="Close folders" accessibilityRole="button" onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {isLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.emptyGalleryBody}>Reading folders on this device...</Text>
              </View>
            ) : folders.length ? (
              <View style={styles.filterSection}>
                {folders.map((folder) => {
                  const isSelected = selected.has(folder.name);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      key={folder.name}
                      onPress={() => toggle(folder.name)}
                      style={({ pressed }) => [
                        styles.folderRow,
                        isSelected && styles.folderRowActive,
                        pressed && styles.settingsRowPressed
                      ]}
                    >
                      <Ionicons
                        name={isSelected ? "checkbox" : "square-outline"}
                        size={22}
                        color={isSelected ? colors.primary : colors.muted}
                      />
                      <View style={styles.flexOne}>
                        <Text style={styles.settingsRowTitle}>{folder.name}</Text>
                        <Text style={styles.bodyMuted}>
                          {/* Both numbers, because "indexed" trailing "images" is how progress reads. */}
                          {formatCount(folder.indexedCount)} of {formatCount(folder.imageCount)} indexed
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="folder-outline" size={30} color={colors.muted} />
                <Text style={styles.emptyGalleryTitle}>No image folders found</Text>
                <Text style={styles.emptyGalleryBody}>Grant photo access so Recall can list the folders on this device.</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={() => setSelected(new Set())}
              style={[styles.subtleButton, styles.sheetFooterButton, isSaving && styles.buttonDisabled]}
            >
              <Text style={styles.subtleButtonText}>Select none</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={save}
              style={[styles.primaryButton, styles.sheetFooterButton, isSaving && styles.buttonDisabled]}
            >
              {isSaving ? <ActivityIndicator color={colors.onPrimary} size="small" /> : null}
              <Text style={styles.primaryButtonText}>
                {/*
                  Folders, not images: what gets indexed inside them also depends on the scope
                  setting, so an image count here would promise more than the scan will read.
                */}
                {selected.size ? `Index ${formatCount(selected.size)} folders` : "Index nothing"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
