import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import type { Screenshot } from "../types/recall";
import { darkColors } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

type ScreenshotCardProps = {
  shot: Screenshot;
  compact?: boolean;
  /** Fills the parent instead of using the fixed carousel width. For vertical lists. */
  fullWidth?: boolean;
  onPress?: (shot: Screenshot) => void;
};

/**
 * Memoized: these render inside horizontal carousels and result lists whose parents re-render on
 * every keystroke of the search field, and a card's props only change when the image itself does.
 */
export const ScreenshotCard = React.memo(function ScreenshotCard({
  shot,
  compact = false,
  fullWidth = false,
  onPress
}: ScreenshotCardProps) {
  const { colors, styles } = useTheme();
  const accent =
    shot.accent === darkColors.secondary
      ? colors.secondary
      : shot.accent === darkColors.tertiary
        ? colors.tertiary
        : colors.primary;

  return (
    <Pressable
      accessibilityLabel={`Open ${shot.title}`}
      accessibilityRole="imagebutton"
      disabled={!onPress}
      onPress={() => onPress?.(shot)}
      style={({ pressed }) => [
        styles.screenshotCard,
        compact && styles.compactScreenshot,
        fullWidth && styles.fullWidthCard,
        pressed && styles.cardPressed
      ]}
    >
      <View style={styles.previewFrame}>
        {shot.uri ? (
          // The service hands lists a cached thumbnail, so this never decodes a full-size screenshot
          // — except in the window before one has been generated, which resizeMethod caps.
          <Image source={{ uri: shot.uri }} style={styles.previewImage} resizeMode="cover" resizeMethod="resize" />
        ) : (
          <LinearGradient colors={[accent, colors.surfaceHigh, colors.background]} style={styles.previewGradient}>
            <View style={styles.previewTopLine} />
            <View style={styles.previewRows}>
              <View style={[styles.previewRow, { width: "75%" }]} />
              <View style={[styles.previewRow, { width: "55%" }]} />
              <View style={[styles.previewRow, { width: "66%" }]} />
            </View>
            <MaterialCommunityIcons name={shot.icon as React.ComponentProps<typeof MaterialCommunityIcons>["name"]} size={44} color="rgba(255,255,255,0.72)" />
          </LinearGradient>
        )}
        {shot.category ? (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{shot.category}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.screenshotFooter}>
        <View style={styles.flexOne}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {shot.title}
          </Text>
          <Text style={styles.bodyMuted} numberOfLines={1}>
            {shot.time} - {shot.source}
          </Text>
        </View>
        <MaterialCommunityIcons name="shield-check" size={22} color={accent} />
      </View>
    </Pressable>
  );
});
