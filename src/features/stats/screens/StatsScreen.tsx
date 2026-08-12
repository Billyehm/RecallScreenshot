import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { MetricCard } from "../../../shared/components/MetricCard";
import { useTheme } from "../../../shared/theme/ThemeContext";
import { formatBytes, formatCount } from "../../../shared/utils/formatBytes";
import type { CategoryCount } from "../../screenshots/domain/screenshotMetadata";
import { useCategoryCounts } from "../../screenshots/hooks/useCategoryCounts";
import { useIndexStatus } from "../../screenshots/hooks/useIndexStatus";
import { useMediaPermission } from "../../screenshots/hooks/useMediaPermission";
import { useStorageInfo } from "../../screenshots/hooks/useStorageInfo";

/** A stage of the indexing pipeline, in the order an image passes through it. */
type PipelineStage = {
  id: string;
  label: string;
  detail: string;
  /** Images that have cleared this stage. */
  done: number;
};

/**
 * What the on-device pipeline has actually produced.
 *
 * Every number here is a count the indexer wrote, not an estimate: a stage that has run on nothing
 * reads as zero, which is the honest answer while the first batch is still working.
 */
export function StatsScreen() {
  const { colors, styles } = useTheme();
  const { isReadable } = useMediaPermission();
  const index = useIndexStatus();
  const { storage, totalBytes, isLoading } = useStorageInfo(isReadable);
  const categoryCounts = useCategoryCounts(isReadable);
  const stageColors = [colors.primary, colors.secondary, colors.tertiary];

  const stages: PipelineStage[] = [
    { id: "ocr", label: "Text recognition", detail: "Read for on-device text", done: storage.ocrRecords },
    { id: "embeddings", label: "Search vectors", detail: "Searchable by meaning", done: storage.embeddings },
    { id: "categories", label: "Categorization", detail: "Sorted into a category", done: categorized(categoryCounts) }
  ];

  // Guards the percentage divisions below. Every one of them is also gated on index.indexed, so the
  // substituted 1 only ever divides a zero.
  const totalImages = Math.max(index.indexed, 1);
  const largestCategory = categoryCounts.reduce<CategoryCount | undefined>(
    (largest, current) => (current.count > (largest?.count ?? 0) ? current : largest),
    undefined
  );

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>Your Insights</Text>
      <Text style={styles.bodyMuted}>
        What Recall has read from this device, and what it costs to keep. All of it computed here, none of it sent
        anywhere.
      </Text>

      <View style={styles.heroMetric}>
        <View style={styles.heroMetricHeader}>
          <Text style={styles.overlinePrimary}>Indexed images</Text>
          <MaterialCommunityIcons name="auto-fix" size={20} color={colors.primary} />
        </View>
        <Text style={styles.bigNumber}>{formatCount(index.indexed)}</Text>
        <Text style={styles.cardBody}>
          {index.discovered
            ? `of ${formatCount(index.discovered)} found in your chosen folders`
            : "No images found in your chosen folders yet"}
        </Text>
        {/* One bar per stage, height proportional to how far that stage has got. A stage that has
            not started still draws a floor, so the row does not collapse into the axis. */}
        <View style={styles.barChart}>
          {stages.map((stage, position) => (
            <View
              key={stage.id}
              style={[
                styles.chartBar,
                {
                  height: `${Math.max(6, Math.min(100, (stage.done / totalImages) * 100))}%`,
                  opacity: 0.5 + position * 0.18
                }
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.statGrid}>
        <MetricCard label="Queued" value={formatCount(index.pending)} color={colors.secondary} />
        <MetricCard label="Categories" value={formatCount(categoryCounts.length)} color={colors.tertiary} />
        <MetricCard label="Index size" value={isLoading ? "—" : formatBytes(totalBytes)} color={colors.secondary} />
        <MetricCard
          label="Status"
          value={
            index.state === "running"
              ? "Indexing"
              : index.state === "paused"
                ? "Paused"
                : index.failed
                  ? "Retrying"
                  : "Ready"
          }
          color="text"
        />
      </View>

      <Text style={styles.sectionTitleText}>Processing Pipeline</Text>
      <View style={styles.efficiencyCard}>
        {stages.map((stage, position) => (
          <View key={stage.id} style={styles.efficiencyRow}>
            <View style={styles.flexOne}>
              <Text style={[styles.efficiencyLabel, { color: stageColors[position % stageColors.length] }]}>
                {stage.label}
              </Text>
              <Text style={styles.bodyMuted}>
                {stage.detail} · {formatCount(stage.done)} image{stage.done === 1 ? "" : "s"}
              </Text>
            </View>
            <Text style={styles.efficiencyValue}>
              {index.indexed ? `${Math.round((stage.done / totalImages) * 100)}%` : "—"}
            </Text>
          </View>
        ))}
        <View style={styles.activeCore}>
          {index.state === "running" ? (
            <ActivityIndicator color={colors.primary} size="large" />
          ) : (
            <MaterialCommunityIcons name="brain" size={44} color={colors.primary} />
          )}
          <Text style={styles.badge}>
            {index.state === "running" ? "Working" : index.state === "paused" ? "Paused" : "Idle"}
          </Text>
        </View>
      </View>

      {largestCategory ? (
        <>
          <Text style={styles.sectionTitleText}>Largest Category</Text>
          <View style={styles.efficiencyCard}>
            <View style={styles.efficiencyRow}>
              <View style={styles.flexOne}>
                <Text style={[styles.efficiencyLabel, { color: colors.primary }]}>{largestCategory.category}</Text>
                <Text style={styles.bodyMuted}>
                  {formatCount(largestCategory.count)} image{largestCategory.count === 1 ? "" : "s"} across{" "}
                  {formatCount(categoryCounts.length)} categor{categoryCounts.length === 1 ? "y" : "ies"}
                </Text>
              </View>
              <Text style={styles.efficiencyValue}>{Math.round((largestCategory.count / totalImages) * 100)}%</Text>
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

/** Images that landed in a named category. "Uncategorized" is the pipeline saying it could not. */
function categorized(counts: CategoryCount[]) {
  return counts.reduce((sum, entry) => (entry.category.toLowerCase() === "uncategorized" ? sum : sum + entry.count), 0);
}
