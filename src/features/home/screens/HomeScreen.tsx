import React from "react";
import { Animated, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { MetricCard } from "../../../shared/components/MetricCard";
import { ScreenshotCard } from "../../../shared/components/ScreenshotCard";
import { SectionTitle } from "../../../shared/components/SectionTitle";
import { usePulse } from "../../../shared/hooks/usePulse";
import { colors } from "../../../shared/theme/colors";
import { styles } from "../../../shared/theme/styles";
import { useScreenshotGallery } from "../../screenshots/hooks/useScreenshotGallery";

type HomeScreenProps = {
  onChatPress: () => void;
};

export function HomeScreen({ onChatPress }: HomeScreenProps) {
  const { screenshots, loadMore } = useScreenshotGallery();
  const pulse = usePulse();
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.18] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.08] });

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.searchPanel}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput placeholder="Search your digital memory..." placeholderTextColor="rgba(203,195,215,0.55)" style={styles.searchInput} />
        <Ionicons name="camera-outline" size={21} color={colors.secondary} />
        <Ionicons name="mic-outline" size={21} color={colors.secondary} />
      </View>

      <View style={styles.aiStatus}>
        <View style={styles.pulseAnchor}>
          <Animated.View style={[styles.pulseRing, { opacity, transform: [{ scale }] }]} />
          <View style={styles.pulseDot} />
        </View>
        <Text style={styles.overline}>AI is listening...</Text>
        <View style={styles.statusLine} />
      </View>

      <SectionTitle icon="sparkles" title="Smart Suggestions" />
      <View style={styles.chipWrap}>
        {["Receipts", "Work", "Social", "Code Snippets"].map((item) => (
          <Pressable key={item} style={styles.chip}>
            <Text style={styles.chipText}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitleText}>Recent Screenshots</Text>
          <Text style={styles.bodyMuted}>Captured across your devices</Text>
        </View>
        <Text style={styles.linkText}>View All</Text>
      </View>
      <FlatList
        horizontal
        data={screenshots}
        keyExtractor={(shot) => shot.id}
        renderItem={({ item }) => <ScreenshotCard shot={item} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalList}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
      />

      <View style={styles.statGrid}>
        <MetricCard label="Index Size" value="12,482" color={colors.primary} />
        <MetricCard label="AI Insights" value="842" color={colors.secondary} />
        <MetricCard label="Sync Status" value="Active" color={colors.tertiary} />
        <MetricCard label="Last Index" value="Just now" color={colors.text} />
      </View>

      <Pressable style={styles.askPanel} onPress={onChatPress}>
        <MaterialCommunityIcons name="auto-fix" size={20} color={colors.primary} />
        <Text style={styles.askText}>Ask AI...</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.primary} />
      </Pressable>
    </ScrollView>
  );
}
