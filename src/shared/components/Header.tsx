import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { colors } from "../theme/colors";
import { styles } from "../theme/styles";

type HeaderProps = {
  onChatPress: () => void;
};

export function Header({ onChatPress }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <View style={styles.logoMark}>
          <MaterialCommunityIcons name="memory" size={22} color={colors.primary} />
        </View>
        <Text style={styles.logoText}>Recall!</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable style={styles.iconButton} onPress={onChatPress}>
          <Ionicons name="search" size={20} color={colors.muted} />
        </Pressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>JD</Text>
        </View>
      </View>
    </View>
  );
}
