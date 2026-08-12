import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import type { CategoryCount } from "../../screenshots/domain/screenshotMetadata";
import type { MediaFolder } from "../../screenshots/native/ScreenshotMediaStore";
import { DATE_RANGE_PRESETS } from "../domain/dateRange";
import { NO_FILTERS, type FilterSelection } from "../hooks/useSearchFilters";

type SearchFilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  selection: FilterSelection;
  onApply: (selection: FilterSelection) => void;
  categories: CategoryCount[];
  folders: MediaFolder[];
};

/**
 * The four filters the search screen supports, as a bottom sheet.
 *
 * Edits are held locally and committed on "Show results" rather than applied as they are tapped:
 * every applied change is a fresh index scan, and building a three-part filter one tap at a time
 * would run three of them. Cancelling discards the draft.
 */
export function SearchFilterSheet({
  visible,
  onClose,
  selection,
  onApply,
  categories,
  folders
}: SearchFilterSheetProps) {
  const { colors, styles } = useTheme();
  const [draft, setDraft] = useState<FilterSelection>(selection);
  const [expanded, setExpanded] = useState<"category" | "date" | "content" | "folder" | null>(null);

  // Re-seeds the draft each time the sheet opens, so a cancelled edit does not persist into the
  // next open. Keyed on `visible` rather than `selection` so an in-flight edit is not overwritten.
  useEffect(() => {
    if (visible) {
      setDraft(selection);
      setExpanded(null);
    }
  }, [selection, visible]);

  const toggle = <K extends keyof FilterSelection>(key: K, value: FilterSelection[K]) => {
    setDraft((current) => ({ ...current, [key]: current[key] === value ? NO_FILTERS[key] : value }));
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetLayer}>
        <Pressable accessibilityLabel="Dismiss filters" accessibilityRole="button" onPress={onClose} style={styles.modalScrim} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={styles.modalTitle}>Filters</Text>
              <Text style={styles.bodyMuted}>Narrow what the search looks at.</Text>
            </View>
            <Pressable accessibilityLabel="Close filters" accessibilityRole="button" onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {categories.length ? (
              <View style={styles.filterSection}>
                <FilterHeader icon="albums-outline" label="Category" summary={draft.category ?? "All categories"} expanded={expanded === "category"} onPress={() => setExpanded((current) => current === "category" ? null : "category")} />
                {expanded === "category" ? <View style={styles.filterOptionPanel}>
                  {categories.map(({ category, count }) => {
                    const isActive = draft.category === category;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        key={category}
                        onPress={() => toggle("category", category)}
                        style={[styles.filterOption, isActive && styles.filterOptionActive]}
                      >
                        <Text style={styles.filterOptionText}>{category}</Text>
                        <Text style={styles.filterOptionCount}>{count}</Text>
                      </Pressable>
                    );
                  })}
                </View> : null}
              </View>
            ) : null}

            <View style={styles.filterSection}>
              <FilterHeader icon="calendar-outline" label="Date taken" summary={DATE_RANGE_PRESETS.find((preset) => preset.id === draft.datePresetId)?.label ?? "Any time"} expanded={expanded === "date"} onPress={() => setExpanded((current) => current === "date" ? null : "date")} />
              {expanded === "date" ? <View style={styles.filterOptionPanel}>
                {DATE_RANGE_PRESETS.map((preset) => {
                  const isActive = draft.datePresetId === preset.id;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      key={preset.id}
                      // Presets are exclusive, so this assigns rather than toggling off to "any".
                      onPress={() => setDraft((current) => ({ ...current, datePresetId: preset.id }))}
                      style={[styles.filterOption, isActive && styles.filterOptionActive]}
                    >
                      <Text style={styles.filterOptionText}>{preset.label}</Text>
                    </Pressable>
                  );
                })}
              </View> : null}
            </View>

            <View style={styles.filterSection}>
              <FilterHeader icon="text-outline" label="Content" summary={draft.hasText ? "Has recognized text" : "Any content"} expanded={expanded === "content"} onPress={() => setExpanded((current) => current === "content" ? null : "content")} />
              {expanded === "content" ? <View style={styles.filterSwitchRow}>
                <Ionicons name="text-outline" size={20} color={colors.secondary} />
                <View style={styles.flexOne}>
                  <Text style={styles.filterOptionText}>Has recognized text</Text>
                  <Text style={styles.bodyMuted}>Only images where text was found on-device.</Text>
                </View>
                <Switch
                  accessibilityLabel="Only images with recognized text"
                  onValueChange={(hasText) => setDraft((current) => ({ ...current, hasText }))}
                  thumbColor={draft.hasText ? colors.onPrimary : colors.muted}
                  trackColor={{ false: colors.surfaceHighest, true: colors.primaryContainer }}
                  value={draft.hasText}
                />
              </View> : null}
            </View>

            {folders.length ? (
              <View style={styles.filterSection}>
                <FilterHeader icon="folder-outline" label="Folder" summary={draft.folder ?? "All folders"} expanded={expanded === "folder"} onPress={() => setExpanded((current) => current === "folder" ? null : "folder")} />
                {expanded === "folder" ? <View style={styles.filterOptionPanel}>
                  {folders.map((folder) => {
                    const isActive = draft.folder === folder.name;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        key={folder.name}
                        onPress={() => toggle("folder", folder.name)}
                        style={[styles.filterOption, isActive && styles.filterOptionActive]}
                      >
                        <Text style={styles.filterOptionText}>{folder.name}</Text>
                        <Text style={styles.filterOptionCount}>{folder.indexedCount}</Text>
                      </Pressable>
                    );
                  })}
                </View> : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onApply(NO_FILTERS);
                onClose();
              }}
              style={[styles.subtleButton, styles.sheetFooterButton]}
            >
              <Text style={styles.subtleButtonText}>Clear all</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onApply(draft);
                onClose();
              }}
              style={[styles.primaryButton, styles.sheetFooterButton]}
            >
              <Text style={styles.primaryButtonText}>Show results</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterHeader({ icon, label, summary, expanded, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  summary: string;
  expanded: boolean;
  onPress: () => void;
}) {
  const { colors, styles } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress} style={[styles.filterDetailRow, expanded && styles.filterDetailRowActive]}>
      <View style={styles.filterDetailIcon}><Ionicons name={icon} size={19} color={colors.primary} /></View>
      <View style={styles.flexOne}>
        <Text style={styles.filterDetailLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.bodyMuted}>{summary}</Text>
      </View>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
    </Pressable>
  );
}
