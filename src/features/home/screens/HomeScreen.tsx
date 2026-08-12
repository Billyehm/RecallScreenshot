import React, { useMemo, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { MetricCard } from "../../../shared/components/MetricCard";
import { SmartScreenshotCarousel } from "../../../shared/components/SmartScreenshotCarousel";
import { SectionTitle } from "../../../shared/components/SectionTitle";
import { usePulse } from "../../../shared/hooks/usePulse";
import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";
import { useScreenshotGallery } from "../../screenshots/hooks/useScreenshotGallery";
import { useIndexStatus } from "../../screenshots/hooks/useIndexStatus";
import { LibraryScreen } from "../../library/screens/LibraryScreen";
import { DeviceImageAccessNotice } from "../../screenshots/components/DeviceImageAccessNotice";
import { ScreenshotViewer } from "../../screenshots/components/ScreenshotViewer";
import { SearchResultList } from "../../search/components/SearchResultList";
import { useSemanticSearch } from "../../search/hooks/useSemanticSearch";

type HomeScreenProps = {
  onChatPress: () => void;
};

export function HomeScreen({ onChatPress }: HomeScreenProps) {
  const { screenshots, categoryCounts, loadMore, permissionStatus, requestAccess, openSettings } =
    useScreenshotGallery();
  const { colors, styles } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | undefined>();
  const [openedShot, setOpenedShot] = useState<Screenshot | null>(null);
  const [isLibraryOpen, setLibraryOpen] = useState(false);
  const pulse = usePulse();
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.18] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.08] });

  const index = useIndexStatus();
  const isReadable = permissionStatus === "granted" || permissionStatus === "limited";

  // The category chip composes with the query rather than replacing it: it is passed down to the
  // native scan, so a narrow category still returns a full page of ranked results.
  const { hits, isSearching, isActive } = useSemanticSearch({
    query: searchQuery,
    category: activeCategory,
    enabled: isReadable
  });

  // Only used for the idle strip. Once a search is active the native ranker owns ordering.
  const recentScreenshots = useMemo(
    () => (activeCategory ? screenshots.filter((shot) => shot.category === activeCategory) : screenshots),
    [activeCategory, screenshots]
  );

  // Hoisted out of the list so the memoized cards keep their props between keystrokes — this
  // screen re-renders on every character typed into the search field.
  const indexingLabel =
    index.state === "running"
      ? `Indexing images${index.pending ? ` - ${index.pending} left` : ""}`
      : index.state === "paused"
        ? "Indexing paused"
        : "Indexing service idle";

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
          placeholder="Search by meaning, e.g. my flight ticket"
          placeholderTextColor={colors.placeholder}
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />
        {isSearching ? <ActivityIndicator color={colors.primary} size="small" /> : null}
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
        <Text style={styles.overline}>{indexingLabel}</Text>
        <View style={styles.statusLine} />
      </View>

      {categoryCounts.length ? (
        <>
          <SectionTitle icon="sparkles" title="Categories" />
          <View style={styles.chipWrap}>
            {categoryCounts.map(({ category, count }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: activeCategory === category }}
                key={category}
                onPress={() => setActiveCategory((current) => (current === category ? undefined : category))}
                style={[styles.chip, activeCategory === category && styles.selectedChip]}
              >
                <Text style={styles.chipText}>{category}</Text>
                <Text style={styles.countBadge}>{count}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.sectionHeader}>
        <View style={styles.flexOne}>
          <Text style={styles.sectionTitleText}>
            {isActive ? "Results" : activeCategory ? activeCategory : "Recent Images"}
          </Text>
          <Text style={styles.bodyMuted}>
            {isActive
              ? `${hits.length} ranked by relevance${activeCategory ? ` in ${activeCategory}` : ""}`
              : "From your device library"}
          </Text>
        </View>
        {!isActive && screenshots.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setLibraryOpen(true)} style={styles.linkButton}>
            <Text style={styles.linkText}>See more</Text>
          </Pressable>
        ) : null}
      </View>

      {isActive ? (
        hits.length ? (
          <SearchResultList hits={hits} onOpen={setOpenedShot} />
        ) : isSearching ? (
          <View style={styles.emptyGallery}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.emptyGalleryBody}>Searching the on-device index...</Text>
          </View>
        ) : (
          <View style={styles.emptyGallery}>
            <Ionicons name={index.isEmpty ? "hourglass-outline" : "search-outline"} size={28} color={colors.muted} />
            <Text style={styles.emptyGalleryTitle}>{index.isEmpty ? "Nothing indexed yet" : "No matches"}</Text>
            {/* An empty index and a genuine miss look identical in the results, so they are named apart. */}
            <Text style={styles.emptyGalleryBody}>
              {index.isEmpty
                ? `Recall is still reading your library${index.discovered ? ` (${index.pending} of ${index.discovered} left)` : ""}. Search works as soon as the first images are processed.`
                : "No image matches that yet. Try fewer words, or clear the category filter."}
            </Text>
          </View>
        )
      ) : recentScreenshots.length ? (
        <SmartScreenshotCarousel screenshots={recentScreenshots} onOpen={setOpenedShot} onEndReached={loadMore} />
      ) : isReadable ? (
        <View style={styles.emptyGallery}>
          <Ionicons name={activeCategory ? "search-outline" : "images-outline"} size={28} color={colors.muted} />
          <Text style={styles.emptyGalleryTitle}>{activeCategory ? "No matching images" : "No images found yet"}</Text>
          <Text style={styles.emptyGalleryBody}>
            {activeCategory
              ? "Nothing matches that filter yet. Images appear here as the indexer classifies them."
              : "Images from your device will appear here after Recall indexes them."}
          </Text>
        </View>
      ) : null}

      <View style={styles.statGrid}>
        <MetricCard label="Indexed" value={index.indexed.toLocaleString()} color={colors.primary} />
        <MetricCard label="Queued" value={index.pending.toLocaleString()} color={colors.secondary} />
        <MetricCard label="Library" value={index.discovered.toLocaleString()} color={colors.tertiary} />
        <MetricCard label="Status" value={index.state === "running" ? "Indexing" : index.failed ? "Retrying" : "Ready"} color="text" />
      </View>

      <Pressable accessibilityRole="button" style={styles.askPanel} onPress={onChatPress}>
        <MaterialCommunityIcons name="auto-fix" size={20} color={colors.primary} />
        <Text style={styles.askText}>Ask AI...</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.primary} />
      </Pressable>

      <ScreenshotViewer screenshots={isActive ? hits.map((hit) => hit.screenshot) : recentScreenshots} screenshot={openedShot} onClose={() => setOpenedShot(null)} onOpenRelated={setOpenedShot} />
      {/* Mounted only while open so its pages are not fetched behind the home screen. */}
      {isLibraryOpen ? (
        <LibraryScreen category={activeCategory} onClose={() => setLibraryOpen(false)} visible />
      ) : null}
    </ScrollView>
  );
}
