import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import type { MediaPermissionStatus } from "../services/androidMediaPermissionService";

type Props = {
  status: MediaPermissionStatus | "checking";
  onRequestAccess: () => void;
  onOpenSettings: () => void;
};

export function DeviceImageAccessNotice({ status, onRequestAccess, onOpenSettings }: Props) {
  const { colors, styles } = useTheme();

  if (status === "granted") return null;

  const isChecking = status === "checking";
  const isLimited = status === "limited";
  const isUnsupported = status === "unsupported";

  return (
    <View style={styles.mediaAccessCard}>
      <View style={styles.mediaAccessIcon}>
        {isChecking ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Ionicons name={isLimited ? "images-outline" : "lock-closed-outline"} size={22} color={colors.primary} />
        )}
      </View>
      <View style={styles.flexOne}>
        <Text style={styles.cardTitle}>
          {isChecking ? "Checking photo access" : isLimited ? "Full access needed" : isUnsupported ? "Photo access unavailable" : "Connect your photo library"}
        </Text>
        <Text style={styles.bodyMuted}>
          {isChecking
            ? "This only takes a moment."
            : isLimited
              ? "Recall can only see selected photos. Allow all photos in Settings to index your complete library."
              : isUnsupported
                ? "Device image indexing is currently available in the Android app."
                : "Allow access to all photos so Recall can organize and search images on this device."}
        </Text>
      </View>
      {!isChecking && !isUnsupported ? (
        <Pressable style={styles.accessButton} onPress={isLimited ? onOpenSettings : onRequestAccess}>
          <Text style={styles.accessButtonText}>{isLimited ? "Settings" : "Allow"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}