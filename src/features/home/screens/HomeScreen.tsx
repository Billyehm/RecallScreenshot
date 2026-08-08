import React, { useMemo, useState } from "react";
import { Animated, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { MetricCard } from "../../../shared/components/MetricCard";
import { ScreenshotCard } from "../../../shared/components/ScreenshotCard";
import { SectionTitle } from "../../../shared/components/SectionTitle";
import { usePulse } from "../../../shared/hooks/usePulse";
import { useTheme } from "../../../shared/theme/ThemeContext";
import { useScreenshotGallery } from "../../screenshots/hooks/useScreenshotGallery";
import { DeviceImageAccessNotice } from "../../screenshots/components/DeviceImageAccessNotice";

type HomeScreenProps = {
  onChatPress: () => void;
};

export function HomeScreen({ onChatPress }: HomeScreenProps) {
  const { screenshots, hasNextPage, loadMore, permissionStatus, requestAccess, openSettings } = useScreenshotGallery();
  const { colors, styles } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const pulse = usePulse();
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.18] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.08] });
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleScreenshots = useMemo(
    () =>
      normalizedQuery
        ? screenshots.filter((shot) => `${shot.title} ${shot.source}`.toLowerCase().includes(normalizedQuery))
        : screenshots,
    [normalizedQuery, screenshots]
  );

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.homeHero}>
        <View style={styles.heroIconRow}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="image-search-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.heroEyebrow}>Personal image library</Text>
        </View>
        <Text style={styles.homeHeroTitle}>Find anything you have seen.</Text>
        <Text style={styles.homeHeroBody}>Search and organize images stored on this device from one private workspace.</Text>
      </View>

      <View style={styles.searchPanel}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          onChangeText={setSearchQuery}
          placeholder="Search your digital memory..."
          placeholderTextColor={colors.placeholder}
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />
        {searchQuery ? (
          <Pressable accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setSearchQuery("")} style={styles.searchClearButton}>
            <Ionicons name="close" size={18} color={colors.secondary} />
          </Pressable>
        ) : null}
      </View>

      <DeviceImageAccessNotice status={permissionStatus} onRequestAccess={requestAccess} onOpenSettings={openSettings} />

      <View style={styles.aiStatus}>
        <View style={styles.pulseAnchor}>
          <Animated.View style={[styles.pulseRing, { opacity, transform: [{ scale }] }]} />
          <View style={styles.pulseDot} />
        </View>
        <Text style={styles.overline}>Indexing service active</Text>
        <View style={styles.statusLine} />
      </View>

      <SectionTitle icon="sparkles" title="Smart Suggestions" />
      <View style={styles.chipWrap}>
        {["Receipts", "Work", "Social", "Code Snippets"].map((item) => (
          <Pressable
            accessibilityRole="button"
            key={item}
            onPress={() => setSearchQuery((current) => (current === item ? "" : item))}
            style={[styles.chip, searchQuery === item && styles.selectedChip]}
          >
            <Text style={styles.chipText}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitleText}>Recent Images</Text>
          <Text style={styles.bodyMuted}>From your device library</Text>
        </View>
        {screenshots.length > 0 && hasNextPage ? (
          <Pressable accessibilityRole="button" onPress={loadMore} style={styles.linkButton}>
            <Text style={styles.linkText}>View More</Text>
          </Pressable>
        ) : null}
      </View>
      {visibleScreenshots.length ? (
        <FlatList
          horizontal
          data={visibleScreenshots}
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
      ) : permissionStatus === "granted" || permissionStatus === "limited" ? (
        <View style={styles.emptyGallery}>
          <Ionicons name={normalizedQuery ? "search-outline" : "images-outline"} size={28} color={colors.muted} />
          <Text style={styles.emptyGalleryTitle}>{normalizedQuery ? "No matching images" : "No images found yet"}</Text>
          <Text style={styles.emptyGalleryBody}>
            {normalizedQuery ? `No indexed image matches "${searchQuery.trim()}".` : "Images from your device will appear here after Recall indexes them."}
          </Text>
        </View>
      ) : null}

      <View style={styles.statGrid}>
        <MetricCard label="Index Size" value="12,482" color={colors.primary} />
        <MetricCard label="AI Insights" value="842" color={colors.secondary} />
        <MetricCard label="Sync Status" value="Active" color={colors.tertiary} />
        <MetricCard label="Last Index" value="Just now" color="text" />
      </View>

      <Pressable accessibilityRole="button" style={styles.askPanel} onPress={onChatPress}>
        <MaterialCommunityIcons name="auto-fix" size={20} color={colors.primary} />
        <Text style={styles.askText}>Ask AI...</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.primary} />
      </Pressable>
    </ScrollView>
  );
}
