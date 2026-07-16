import React from "react";
import { ScrollView, Text, View } from "react-native";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { MetricCard } from "../../../shared/components/MetricCard";
import { colors } from "../../../shared/theme/colors";
import { styles } from "../../../shared/theme/styles";
import { useEfficiencyMetrics } from "../../memory/hooks/useEfficiencyMetrics";

export function StatsScreen() {
  const { data: efficiency } = useEfficiencyMetrics();

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Your Insights</Text>
      <Text style={styles.bodyMuted}>Recall has analyzed your digital footprint to optimize storage and discover hidden patterns.</Text>

      <View style={styles.heroMetric}>
        <View style={styles.heroMetricHeader}>
          <Text style={styles.overlinePrimary}>Digital Memory</Text>
          <MaterialCommunityIcons name="auto-fix" size={20} color={colors.primary} />
        </View>
        <Text style={styles.bigNumber}>1,248</Text>
        <Text style={styles.cardBody}>Total screenshots indexed</Text>
        <View style={styles.barChart}>
          {[40, 60, 45, 85, 100].map((height, index) => (
            <View key={height + index} style={[styles.chartBar, { height: `${height}%`, opacity: 0.45 + index * 0.12 }]} />
          ))}
        </View>
      </View>

      <View style={styles.statGrid}>
        <MetricCard label="Storage Optimization" value="4.2 GB" color={colors.secondary} />
        <MetricCard label="Duplicates Removed" value="156" color={colors.tertiary} />
        <MetricCard label="Categories Discovered" value="24" color={colors.secondary} />
        <MetricCard label="Recall Velocity" value="+12%" color={colors.primary} />
      </View>

      <Text style={styles.sectionTitleText}>AI Efficiency Map</Text>
      <View style={styles.efficiencyCard}>
        {efficiency.map((item) => (
          <View key={item.id} style={styles.efficiencyRow}>
            <View>
              <Text style={[styles.efficiencyLabel, { color: item.color }]}>{item.label}</Text>
              <Text style={styles.bodyMuted}>{item.detail}</Text>
            </View>
            <Text style={styles.efficiencyValue}>{item.value}</Text>
          </View>
        ))}
        <View style={styles.activeCore}>
          <MaterialCommunityIcons name="brain" size={44} color={colors.primary} />
          <Text style={styles.badge}>Active</Text>
        </View>
      </View>
    </ScrollView>
  );
}
