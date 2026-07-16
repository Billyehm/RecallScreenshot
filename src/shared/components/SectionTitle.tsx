import React from "react";
import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { colors } from "../theme/colors";
import { styles } from "../theme/styles";

type SectionTitleProps = {
  icon: string;
  title: string;
};

export function SectionTitle({ icon, title }: SectionTitleProps) {
  return (
    <View style={styles.titleRow}>
      <Ionicons name={icon as React.ComponentProps<typeof Ionicons>["name"]} size={19} color={colors.secondary} />
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );
}
