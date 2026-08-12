import React, { useCallback, useMemo } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, Text, useWindowDimensions, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";
import { formatBytes } from "../../../shared/utils/formatBytes";
import { formatDateGroup } from "../../../shared/utils/relativeTime";

export type LibraryLayout = "grid" | "list";

/** Columns in grid mode. Three keeps thumbnails legible on a phone without a measured layout. */
const GRID_COLUMNS = 3;

/** Tight, like a file browser: the images should read as one surface, not as separate cards. */
const GRID_GAP = 3;
const GRID_PADDING = 3;

const HEADER_HEIGHT = 44;
const LIST_ROW_HEIGHT = 72;

/**
 * One entry per rendered row. Images are pre-chunked into grid rows rather than handed to FlatList's
 * numColumns, because a date heading has to sit between them and numColumns cannot express that.
 * Keeping one item per visual row also means getItemLayout stays exact across both layouts.
 */
type BrowserRow =
  | { kind: "header"; key: string; label: string; height: number }
  | { kind: "tiles"; key: string; items: Screenshot[]; height: number }
  | { kind: "row"; key: string; item: Screenshot; height: number };

type ScreenshotBrowserProps = {
  screenshots: Screenshot[];
  layout: LibraryLayout;
  onPress: (shot: Screenshot) => void;
  /** Present only in selection mode; when set, tiles show a checkmark instead of opening. */
  selectedIds?: ReadonlySet<string>;
  /** Enters selection mode from a long press, the way a file browser does. */
  onLongPress?: (shot: Screenshot) => void;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  emptyTitle: string;
  emptyBody: string;
  ListHeaderComponent?: React.ComponentProps<typeof FlatList>["ListHeaderComponent"];
};

/**
 * The one list that renders a library of images, in either layout.
 *
 * Both layouts render the cached thumbnail, never the original — a grid of full-resolution decodes
 * is what makes an image browser run out of memory on a large library. Rows are grouped under date
 * headings because that is how someone actually looks for a screenshot they remember taking.
 */
export function ScreenshotBrowser({
  screenshots,
  layout,
  onPress,
  selectedIds,
  onLongPress,
  onEndReached,
  isFetchingNextPage,
  emptyTitle,
  emptyBody,
  ListHeaderComponent
}: ScreenshotBrowserProps) {
  const { colors, styles } = useTheme();
  const { width } = useWindowDimensions();
  const isGrid = layout === "grid";

  // Derived from the live window width so the tiles stay square on rotation and on any screen size.
  const tileSize = Math.floor((width - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  const rows = useMemo(
    () => buildRows(screenshots, isGrid, tileSize),
    [isGrid, screenshots, tileSize]
  );

  // Row heights vary by kind, so the offsets are accumulated once here rather than derived from a
  // single constant stride. This is what lets a mixed header/content list skip measuring entirely.
  const offsets = useMemo(() => {
    const result = new Array<number>(rows.length);
    let running = 0;
    for (let index = 0; index < rows.length; index += 1) {
      result[index] = running;
      running += rows[index].height;
    }
    return result;
  }, [rows]);

  const getItemLayout = useCallback(
    (_data: ArrayLike<BrowserRow> | null | undefined, index: number) => ({
      length: rows[index]?.height ?? 0,
      offset: offsets[index] ?? 0,
      index
    }),
    [offsets, rows]
  );

  const renderTile = useCallback(
    (item: Screenshot) => {
      const isSelected = selectedIds?.has(item.id) ?? false;

      return (
        <Pressable
          accessibilityLabel={item.title}
          accessibilityRole="imagebutton"
          accessibilityState={selectedIds ? { selected: isSelected } : undefined}
          key={item.id}
          onLongPress={onLongPress ? () => onLongPress(item) : undefined}
          onPress={() => onPress(item)}
          style={[styles.galleryTile, { width: tileSize, height: tileSize }]}
        >
          <Image
            // The service hands lists a cached thumbnail; resizeMethod caps the decode in the window
            // before one has been generated, when this is still pointing at the original.
            source={{ uri: item.uri }}
            style={[styles.galleryTileImage, isSelected && styles.galleryTileImageSelected]}
            resizeMode="cover"
            resizeMethod="resize"
          />
          {isSelected ? (
            <View style={styles.galleryTileCheck}>
              <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [colors, onLongPress, onPress, selectedIds, styles, tileSize]
  );

  const renderItem = useCallback(
    ({ item: row }: { item: BrowserRow }) => {
      if (row.kind === "header") {
        return (
          <View style={styles.galleryHeader}>
            <Text style={styles.galleryHeaderText}>{row.label}</Text>
          </View>
        );
      }

      if (row.kind === "tiles") {
        return <View style={styles.galleryTileRow}>{row.items.map(renderTile)}</View>;
      }

      const { item } = row;
      const isSelected = selectedIds?.has(item.id) ?? false;

      return (
        <Pressable
          accessibilityLabel={item.title}
          accessibilityRole="imagebutton"
          accessibilityState={selectedIds ? { selected: isSelected } : undefined}
          onLongPress={onLongPress ? () => onLongPress(item) : undefined}
          onPress={() => onPress(item)}
          style={({ pressed }) => [styles.fileRow, isSelected && styles.fileRowSelected, pressed && styles.fileRowPressed]}
        >
          <Image source={{ uri: item.uri }} style={styles.fileThumb} resizeMode="cover" resizeMethod="resize" />
          <View style={styles.flexOne}>
            <Text numberOfLines={1} style={styles.fileName}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={styles.fileMeta}>
              {describe(item)}
            </Text>
          </View>
          {selectedIds ? (
            <Ionicons
              name={isSelected ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={isSelected ? colors.primary : colors.muted}
            />
          ) : null}
        </Pressable>
      );
    },
    [colors, onLongPress, onPress, renderTile, selectedIds, styles]
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderItem}
      contentContainerStyle={isGrid ? styles.galleryContent : styles.fileListContent}
      // A caller-supplied header has an unknown height, which would offset every precomputed row.
      // Measuring is the honest fallback in that case; no current caller passes one.
      getItemLayout={ListHeaderComponent ? undefined : getItemLayout}
      ListHeaderComponent={ListHeaderComponent}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={false}
      // Each row is now a full row of tiles, so the same on-screen area needs far fewer of them.
      initialNumToRender={isGrid ? 6 : 10}
      maxToRenderPerBatch={isGrid ? 6 : 10}
      windowSize={5}
      removeClippedSubviews
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={30} color={colors.muted} />
          <Text style={styles.emptyGalleryTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyGalleryBody}>{emptyBody}</Text>
        </View>
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.footerLoader}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null
      }
    />
  );
}

/**
 * Flattens the page into headed rows. The list arrives already sorted newest-first from SQLite, so
 * a heading starts wherever the group label changes — no second sort, and no grouping map to hold.
 */
function buildRows(screenshots: Screenshot[], isGrid: boolean, tileSize: number): BrowserRow[] {
  const rows: BrowserRow[] = [];
  let currentLabel: string | undefined;
  let pending: Screenshot[] = [];

  const flushTiles = () => {
    if (pending.length === 0) return;
    rows.push({ kind: "tiles", key: `tiles-${pending[0].id}`, items: pending, height: tileSize + GRID_GAP });
    pending = [];
  };

  for (const shot of screenshots) {
    // Undated rows would each become their own heading, so they collapse into the previous group.
    const label = shot.createdAt ? formatDateGroup(shot.createdAt) : currentLabel ?? "Undated";

    if (label !== currentLabel) {
      flushTiles();
      rows.push({ kind: "header", key: `header-${label}-${shot.id}`, label, height: HEADER_HEIGHT });
      currentLabel = label;
    }

    if (!isGrid) {
      rows.push({ kind: "row", key: shot.id, item: shot, height: LIST_ROW_HEIGHT });
      continue;
    }

    pending.push(shot);
    if (pending.length === GRID_COLUMNS) flushTiles();
  }

  flushTiles();
  return rows;
}

/** File-browser subtitle: size first, then category, the way a file manager leads with the file. */
function describe(shot: Screenshot): string {
  const parts = [shot.size ? formatBytes(shot.size) : undefined, shot.category, shot.time];
  return parts.filter(Boolean).join(" · ");
}
