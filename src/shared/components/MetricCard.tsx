import React from "react";
import { Text, View } from "react-native";

import { useTheme } from "../theme/ThemeContext";

type MetricCardProps = {
  label: string;
  value: string;
  color: string;
};

export function MetricCard({ label, value, color }: MetricCardProps) {
  const { colors, styles } = useTheme();
  const valueColor = color === "text" ? colors.text : color;

  return (
    <View style={[styles.metricCard, { borderLeftColor: valueColor }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}
