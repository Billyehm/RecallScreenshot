import React from "react";
import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { AnimatedPressable } from "./AnimatedPressable";
import { useTheme } from "../theme/ThemeContext";

type HeaderProps = {
  onChatPress: () => void;
  onMenuPress: () => void;
};

export function Header({ onChatPress, onMenuPress }: HeaderProps) {
  const { colors, styles } = useTheme();

  return (
    <View style={styles.header}>
      <AnimatedPressable style={styles.brand} onPress={onMenuPress} pressedScale={0.98}>
        <View style={styles.logoMark}>
          <MaterialCommunityIcons name="memory" size={22} color={colors.primary} />
        </View>
        <View>
          <Text style={styles.logoText}>Recall</Text>
          <Text style={styles.logoCaption}>Memory workspace</Text>
        </View>
      </AnimatedPressable>
      <View style={styles.headerActions}>
        <AnimatedPressable style={styles.iconButton} onPress={onChatPress}>
          <Ionicons name="sparkles" size={20} color={colors.secondary} />
        </AnimatedPressable>
      </View>
    </View>
  );
}
