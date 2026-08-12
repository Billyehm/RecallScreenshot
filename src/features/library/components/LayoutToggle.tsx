import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import type { LibraryLayout } from "./ScreenshotBrowser";

type LayoutToggleProps = {
  layout: LibraryLayout;
  onChange: (layout: LibraryLayout) => void;
};

const OPTIONS: Array<{ value: LibraryLayout; icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }> = [
  { value: "grid", icon: "grid-outline", label: "Grid" },
  { value: "list", icon: "list-outline", label: "List" }
];

/** Grid/list switch. Both options stay visible so the alternative is discoverable, not hidden behind a toggle. */
export function LayoutToggle({ layout, onChange }: LayoutToggleProps) {
  const { colors, styles } = useTheme();

  return (
    <View accessibilityRole="tablist" style={styles.segmentedControl}>
      {OPTIONS.map((option) => {
        const isActive = layout === option.value;
        return (
          <Pressable
            accessibilityLabel={`${option.label} view`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, isActive && styles.segmentActive]}
          >
            <Ionicons name={option.icon} size={17} color={isActive ? colors.onPrimary : colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}
