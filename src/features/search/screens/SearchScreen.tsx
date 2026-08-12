import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { ScreenshotCard } from "../../../shared/components/ScreenshotCard";
import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";
import { DeviceImageAccessNotice } from "../../screenshots/components/DeviceImageAccessNotice";
import { ScreenshotViewer } from "../../screenshots/components/ScreenshotViewer";
import { useCategoryCounts } from "../../screenshots/hooks/useCategoryCounts";
import { useIndexStatus } from "../../screenshots/hooks/useIndexStatus";
import { useMediaFolders } from "../../screenshots/hooks/useMediaFolders";
import { useMediaPermission } from "../../screenshots/hooks/useMediaPermission";
import { SearchFilterSheet } from "../components/SearchFilterSheet";
import type { SearchHit } from "../domain/searchResult";
import { useSearchFilters } from "../hooks/useSearchFilters";
import { useSemanticSearch } from "../hooks/useSemanticSearch";

/**
 * Full-screen natural-language search over the on-device index.
 *
 * Unlike the inline results on Home, this screen owns its scroll container, so results render in a
 * virtualized list and a large result set costs one screenful of views rather than all of them.
 */
export function SearchScreen() {
  const { colors, styles } = useTheme();
  const [query, setQuery] = useState("");
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [openedShot, setOpenedShot] = useState<Screenshot | null>(null);

  // Deliberately not the gallery hook: this screen never shows an unsearched list, so paging the
  // library behind an empty result area would be work nothing renders.
  const { status: permissionStatus, isReadable, requestAccess, openSettings } = useMediaPermission();
  const { selection, filters, activeFilters, isFiltered, apply, remove } = useSearchFilters();
  const index = useIndexStatus();
  const categoryCounts = useCategoryCounts(isReadable);
  const { folders } = useMediaFolders(isReadable);

  const { hits, isSearching, isActive } = useSemanticSearch({ query, filters, enabled: isReadable });

  const renderHit = useCallback(
    ({ item }: { item: SearchHit }) => (
      <View style={styles.resultItem}>
        <ScreenshotCard fullWidth shot={item.screenshot} onPress={setOpenedShot} />
        {item.matchedTerms.length ? (
          <View style={styles.matchTermRow}>
            {/* Why this image is here: the indexed terms it shares with the query. */}
            <Text style={styles.bodyMuted}>Matched</Text>
            {item.matchedTerms.map((term) => (
              <View key={term} style={styles.matchTerm}>
                <Text style={styles.matchTermText}>{term}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    ),
    [styles]
  );

  const summary = useMemo(() => {
    if (!isActive) return "Describe what you remember about an image.";
    if (isSearching && !hits.length) return "Searching the on-device index...";
    return `${hits.length} result${hits.length === 1 ? "" : "s"} ranked by relevance`;
  }, [hits.length, isActive, isSearching]);

  return (
    <View style={styles.searchScreen}>
      <View style={styles.searchHeader}>
        <View style={styles.searchInputRow}>
          <View style={[styles.searchPanel, styles.flexOne]}>
            <Ionicons name="search" size={20} color={colors.muted} />
            <TextInput
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="e.g. the receipt from the hardware store"
              placeholderTextColor={colors.placeholder}
              returnKeyType="search"
              style={styles.searchInput}
              value={query}
            />
            {isSearching ? <ActivityIndicator color={colors.primary} size="small" /> : null}
            {query ? (
              <Pressable
                accessibilityLabel="Clear search"
                accessibilityRole="button"
                onPress={() => setQuery("")}
                style={styles.searchClearButton}
              >
                <Ionicons name="close" size={18} color={colors.secondary} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={`Filters${activeFilters.length ? `, ${activeFilters.length} active` : ""}`}
            accessibilityRole="button"
            onPress={() => setSheetOpen(true)}
            style={[styles.filterButton, isFiltered && styles.filterButtonActive]}
          >
            <Ionicons name="options-outline" size={21} color={isFiltered ? colors.primary : colors.muted} />
            {activeFilters.length ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilters.length}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {activeFilters.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFilterRow}>
            {activeFilters.map((filter) => (
              <Pressable
                accessibilityLabel={`Remove filter ${filter.label}`}
                accessibilityRole="button"
                key={filter.key}
                onPress={() => remove(filter.key)}
                style={styles.activeFilterChip}
              >
                <Text style={styles.activeFilterText}>{filter.label}</Text>
                <Ionicons name="close-circle" size={16} color={colors.primary} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <DeviceImageAccessNotice status={permissionStatus} onRequestAccess={requestAccess} onOpenSettings={openSettings} />
      </View>

      <View style={styles.searchStatusRow}>
        <Text style={styles.bodyMuted}>{summary}</Text>
      </View>

      <FlatList
        data={isActive ? hits : []}
        keyExtractor={(hit) => hit.screenshot.id}
        renderItem={renderHit}
        contentContainerStyle={[styles.listContent, styles.tabBarClearance]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
        ListEmptyComponent={
          <SearchPlaceholder
            hasQuery={isActive}
            isEmptyIndex={index.isEmpty}
            isSearching={isSearching}
            pending={index.pending}
            discovered={index.discovered}
          />
        }
      />

      <SearchFilterSheet
        categories={categoryCounts}
        folders={folders}
        onApply={apply}
        onClose={() => setSheetOpen(false)}
        selection={selection}
        visible={isSheetOpen}
      />
      <ScreenshotViewer screenshots={hits.map((hit) => hit.screenshot)} onClose={() => setOpenedShot(null)} onOpenRelated={setOpenedShot} screenshot={openedShot} />
    </View>
  );
}

type SearchPlaceholderProps = {
  hasQuery: boolean;
  isSearching: boolean;
  isEmptyIndex: boolean;
  pending: number;
  discovered: number;
};

/**
 * The four ways the results area can be empty. They look identical in the list but mean different
 * things, so each says which one it is — an index that has not caught up is not a failed search.
 */
function SearchPlaceholder({ hasQuery, isSearching, isEmptyIndex, pending, discovered }: SearchPlaceholderProps) {
  const { colors, styles } = useTheme();

  if (isSearching) {
    return (
      <View style={styles.emptyState}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.emptyGalleryBody}>Searching the on-device index...</Text>
      </View>
    );
  }

  if (!hasQuery) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={30} color={colors.muted} />
        <Text style={styles.emptyGalleryTitle}>Search your library</Text>
        <Text style={styles.emptyGalleryBody}>
          Search by what an image shows or says — recognized text, objects and categories are all matched on this
          device. Filters narrow the search before it runs.
        </Text>
      </View>
    );
  }

  if (isEmptyIndex) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="hourglass-outline" size={30} color={colors.muted} />
        <Text style={styles.emptyGalleryTitle}>Nothing indexed yet</Text>
        <Text style={styles.emptyGalleryBody}>
          {`Recall is still reading your library${discovered ? ` (${pending} of ${discovered} left)` : ""}. Search works as soon as the first images are processed.`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyState}>
      <Ionicons name="file-tray-outline" size={30} color={colors.muted} />
      <Text style={styles.emptyGalleryTitle}>No matches</Text>
      <Text style={styles.emptyGalleryBody}>Try fewer words, or remove a filter.</Text>
    </View>
  );
}
