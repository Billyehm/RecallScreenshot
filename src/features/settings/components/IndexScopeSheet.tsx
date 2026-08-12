import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import type { IndexScope } from "../../screenshots/native/ScreenshotMediaStore";

type IndexScopeSheetProps = {
  visible: boolean;
  onClose: () => void;
  scope: IndexScope;
  /** Resolves once the new scope is stored and the rescan has been queued. */
  onSave: (scope: IndexScope) => Promise<unknown>;
  isSaving: boolean;
};

type ScopeOption = {
  value: IndexScope;
  title: string;
  detail: string;
  /** Footer label for this choice, so the button states what saving will actually do. */
  action: string;
};

/**
 * Both options stay visible with their consequences spelled out, rather than hiding one behind a
 * switch's off position: "index everything" costs real battery, storage and reading time, so it
 * should be chosen rather than stumbled into.
 */
const OPTIONS: readonly ScopeOption[] = [
  {
    value: "screenshotsOnly",
    title: "Screenshots only",
    detail: "Images that look like screenshots, wherever this device saves them. The default.",
    action: "Index screenshots only"
  },
  {
    value: "allImages",
    title: "Every image on this device",
    detail: "Photos, downloads and saved images too — far more to read, and more storage and battery.",
    action: "Index every image"
  }
];

/**
 * Chooses what Recall is allowed to index.
 *
 * Held as a draft and written once on save, like the folder scope and for the same reason: each
 * intermediate choice would queue a rescan that retires rows and re-indexes work on the way to the
 * one the user actually wanted.
 */
export function IndexScopeSheet({ visible, onClose, scope, onSave, isSaving }: IndexScopeSheetProps) {
  const { colors, styles } = useTheme();
  const [selected, setSelected] = useState<IndexScope>(scope);

  // Re-seeded from the stored scope each open, so a cancelled edit does not carry into the next one.
  useEffect(() => {
    if (visible) setSelected(scope);
  }, [scope, visible]);

  const save = async () => {
    // Nothing changed, so there is no rescan worth queueing.
    if (selected === scope) {
      onClose();
      return;
    }
    try {
      await onSave(selected);
      onClose();
    } catch {
      // The screen reports the failure. Staying open keeps the choice so it can be retried.
    }
  };

  const footerLabel = OPTIONS.find((option) => option.value === selected)?.action ?? "Save";

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetLayer}>
        <Pressable
          accessibilityLabel="Dismiss what to index"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.modalScrim}
        />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>What to index</Text>
              <Text style={styles.bodyMuted}>
                Recall reads only what you pick here. Nothing it reads leaves this device, and no image is
                ever deleted.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close what to index"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <View style={styles.filterSection}>
              {OPTIONS.map((option) => {
                const isSelected = selected === option.value;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                    disabled={isSaving}
                    key={option.value}
                    onPress={() => setSelected(option.value)}
                    style={({ pressed }) => [
                      styles.folderRow,
                      isSelected && styles.folderRowActive,
                      pressed && styles.settingsRowPressed
                    ]}
                  >
                    <Ionicons
                      name={isSelected ? "radio-button-on" : "radio-button-off"}
                      size={22}
                      color={isSelected ? colors.primary : colors.muted}
                    />
                    <View style={styles.flexOne}>
                      <Text style={styles.settingsRowTitle}>{option.title}</Text>
                      <Text style={styles.bodyMuted}>{option.detail}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.sheetFooter}>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              onPress={save}
              style={[styles.primaryButton, styles.sheetFooterButton, isSaving && styles.buttonDisabled]}
            >
              {isSaving ? <ActivityIndicator color={colors.onPrimary} size="small" /> : null}
              <Text style={styles.primaryButtonText}>{footerLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
