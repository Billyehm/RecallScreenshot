import React from "react";
import { Image, Text, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import type { Screenshot } from "../types/recall";
import { colors } from "../theme/colors";
import { styles } from "../theme/styles";

type ScreenshotCardProps = {
  shot: Screenshot;
  compact?: boolean;
};

export function ScreenshotCard({ shot, compact = false }: ScreenshotCardProps) {
  return (
    <View style={[styles.screenshotCard, compact && styles.compactScreenshot]}>
      {shot.uri ? (
        <Image source={{ uri: shot.uri }} style={styles.previewImage} resizeMode="cover" />
      ) : (
        <LinearGradient colors={[shot.accent, colors.surfaceHigh, colors.background]} style={styles.previewGradient}>
          <View style={styles.previewTopLine} />
          <View style={styles.previewRows}>
            <View style={[styles.previewRow, { width: "75%" }]} />
            <View style={[styles.previewRow, { width: "55%" }]} />
            <View style={[styles.previewRow, { width: "66%" }]} />
          </View>
          <MaterialCommunityIcons name={shot.icon as React.ComponentProps<typeof MaterialCommunityIcons>["name"]} size={44} color="rgba(255,255,255,0.72)" />
        </LinearGradient>
      )}
      <View style={styles.screenshotFooter}>
        <View style={styles.flexOne}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {shot.title}
          </Text>
          <Text style={styles.bodyMuted}>
            {shot.time} - {shot.source}
          </Text>
        </View>
        <MaterialCommunityIcons name="shield-check" size={22} color={shot.accent} />
      </View>
    </View>
  );
}
