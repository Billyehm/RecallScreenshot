import React from "react";
import { Text, View } from "react-native";

import { styles } from "../theme/styles";

type MetricCardProps = {
  label: string;
  value: string;
  color: string;
};

export function MetricCard({ label, value, color }: MetricCardProps) {
  return (
    <View style={[styles.metricCard, { borderLeftColor: color }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}
