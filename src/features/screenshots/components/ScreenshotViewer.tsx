import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Image, Modal, PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";
import { formatBytes } from "../../../shared/utils/formatBytes";
import { queryKeys } from "../../../shared/utils/queryKeys";
import { useCollectionLibrary } from "../../collections/hooks/useCollectionLibrary";
import { useSimilarScreenshots } from "../../search/hooks/useSimilarScreenshots";
import { useScreenshotActions } from "../hooks/useScreenshotActions";
import { screenshotService } from "../services/screenshotService";

type ScreenshotViewerProps = {
  screenshot: Screenshot | null;
  screenshots?: Screenshot[];
  onClose: () => void;
  /**
   * Opens a related image from the similar-images row. Optional because the viewer stays
   * controlled: without it the row is still shown, just not navigable.
   */
  onOpenRelated?: (shot: Screenshot) => void;
};

/**
 * Full-screen viewer. The image occupies the whole screen; everything else — similar images,
 * recognized text, metadata, and filing into categories — lives behind the three-dot menu in the top
 * corner, so nothing competes with the image itself.
 *
 * The list only ever decoded a thumbnail, so the original is fetched here — the one place a
 * full-resolution decode is actually justified.
 */
export function ScreenshotViewer({ screenshot, screenshots = [], onClose, onOpenRelated }: ScreenshotViewerProps) {
  const { colors, styles } = useTheme();
  const insets = useSafeAreaInsets();
  const [isImageLoading, setImageLoading] = useState(true);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isDetailsOpen, setDetailsOpen] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scaleNow = useRef(1);
  const pinchStart = useRef(0);
  const pinchScaleStart = useRef(1);
  const { collections, setMembership, isMutating } = useCollectionLibrary();
  const { confirmDelete, shareScreenshot, isDeleting, isSharing } = useScreenshotActions({ onDeleted: onClose });

  // The list row carries only an OCR snippet; the detail query returns the complete text.
  const detail = useQuery({
    queryKey: queryKeys.screenshotDetail(screenshot?.id ?? ""),
    queryFn: () => screenshotService.getScreenshot(screenshot!.id),
    enabled: Boolean(screenshot?.id)
  });

  const currentIndex = screenshots.findIndex((candidate) => candidate.id === screenshot?.id);
  const openAdjacent = useCallback((direction: -1 | 1) => {
    if (currentIndex < 0) return;
    const adjacent = screenshots[currentIndex + direction];
    if (adjacent) onOpenRelated?.(adjacent);
  }, [currentIndex, onOpenRelated, screenshots]);

  const resetTransform = useCallback(() => {
    scaleNow.current = 1;
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true })
    ]).start();
  }, [scale, translateX, translateY]);

  const gestures = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => event.nativeEvent.touches.length > 1,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      gesture.numberActiveTouches > 1 || Math.abs(gesture.dx) > 7 || Math.abs(gesture.dy) > 7,
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches;
      if (touches.length > 1) {
        pinchStart.current = touchDistance(touches[0], touches[1]);
        pinchScaleStart.current = scaleNow.current;
      }
    },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches;
      if (touches.length > 1) {
        const start = pinchStart.current || touchDistance(touches[0], touches[1]);
        const next = Math.max(1, Math.min(5, pinchScaleStart.current * touchDistance(touches[0], touches[1]) / start));
        scaleNow.current = next;
        scale.setValue(next);
      } else if (scaleNow.current > 1) {
        translateX.setValue(gesture.dx);
        translateY.setValue(gesture.dy);
      }
    },
    onPanResponderRelease: (_event, gesture) => {
      if (scaleNow.current <= 1.01 && Math.abs(gesture.dx) > 55 && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
        openAdjacent(gesture.dx < 0 ? 1 : -1);
      }
      if (scaleNow.current <= 1.01) resetTransform();
    },
    onPanResponderTerminate: resetTransform
  }), [openAdjacent, resetTransform, scale, translateX, translateY]);

  useEffect(() => {
    if (!screenshot?.id) return;
    setImageLoading(true);
    // A new image means the menu and sheet from the previous one are no longer about anything.
    setMenuOpen(false);
    setDetailsOpen(false);
    resetTransform();
    screenshotService.recordViewed(screenshot.id).catch(() => {
      // A view counter must never block opening an image.
    });
  }, [resetTransform, screenshot?.id]);

  const item = detail.data ?? screenshot;
  const memberIds = useMemo(() => new Set(item?.collectionIds ?? []), [item?.collectionIds]);

  // Only fetched once the details sheet is open: similarity search streams the whole index, which is
  // far too much work to spend on a viewer the user may only be swiping through.
  const { similar, isLoading: isLoadingSimilar } = useSimilarScreenshots(
    isDetailsOpen ? screenshot?.fullUri ?? screenshot?.uri : undefined
  );

  // The native side excludes the query image by URI; this also excludes it by id, which covers the
  // case where the same image is reachable under a second URI.
  const related = useMemo(() => similar.filter((hit) => hit.screenshot.id !== item?.id), [item?.id, similar]);

  const sourceUri = item?.fullUri ?? item?.uri ?? "";
  const onShare = useCallback(() => {
    setMenuOpen(false);
    shareScreenshot(sourceUri);
  }, [shareScreenshot, sourceUri]);

  const onDelete = useCallback(() => {
    setMenuOpen(false);
    confirmDelete(sourceUri, item?.title);
  }, [confirmDelete, item?.title, sourceUri]);

  const onToggleMembership = useCallback(
    (collectionId: string, member: boolean) => {
      if (!item) return;
      setMembership({ collectionId, screenshotId: item.id, member }).then(() => detail.refetch());
    },
    [detail, item, setMembership]
  );

  if (!screenshot || !item) return null;

  const confidence = Math.round((item.categoryConfidence ?? 0) * 100);
  const ocrConfidence = Math.round((item.ocrConfidence ?? 0) * 100);
  const hasText = Boolean(item.ocrText?.trim());
  const isBusy = isDeleting || isSharing;

  return (
    <Modal animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewerStage}>
        <Animated.Image
          source={{ uri: item.fullUri ?? item.uri }}
          style={[styles.viewerFullImage, { transform: [{ translateX }, { translateY }, { scale }] }]}
          resizeMode="contain"
          onLoadEnd={() => setImageLoading(false)}
          // The one place a full-resolution decode is justified. Capping it at the screen means a
          // 50-megapixel image still costs a screenful of pixels rather than its native size.
          resizeMethod="resize"
          progressiveRenderingEnabled
          {...gestures.panHandlers}
        />
        {isImageLoading ? <ActivityIndicator color="#ffffff" style={styles.viewerSpinner} /> : null}

        <View style={[styles.viewerOverlayTop, { top: Math.max(insets.top, 12) }]}>
          <Pressable
            accessibilityLabel="Close image"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.viewerOverlayButton}
          >
            <Ionicons name="close" size={22} color="#ffffff" />
          </Pressable>
          <Pressable
            accessibilityLabel="More options"
            accessibilityRole="button"
            accessibilityState={{ expanded: isMenuOpen }}
            onPress={() => setMenuOpen((open) => !open)}
            style={styles.viewerOverlayButton}
          >
            {isBusy ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Ionicons name="ellipsis-vertical" size={22} color="#ffffff" />
            )}
          </Pressable>
        </View>

        {isMenuOpen ? (
          <>
            {/* Catches the tap that dismisses the menu, so anywhere off it closes it. */}
            <Pressable
              accessibilityLabel="Dismiss menu"
              onPress={() => setMenuOpen(false)}
              style={styles.viewerMenuScrim}
            />
            <View style={[styles.viewerMenu, { top: Math.max(insets.top, 12) + 52 }]}>
              <MenuItem
                caption="Similar images, recognized text and metadata"
                icon="information-circle-outline"
                label="Show details"
                onPress={() => {
                  setMenuOpen(false);
                  setDetailsOpen(true);
                }}
              />
              <View style={styles.viewerMenuDivider} />
              <MenuItem
                caption="Send this image to another app"
                disabled={isSharing}
                icon="share-social-outline"
                label="Share"
                onPress={onShare}
              />
              <MenuItem
                caption="Remove it from this device"
                disabled={isDeleting}
                icon="trash-outline"
                isDestructive
                label="Delete"
                onPress={onDelete}
              />
            </View>
          </>
        ) : null}
      </View>

      <Modal animationType="slide" onRequestClose={() => setDetailsOpen(false)} transparent visible={isDetailsOpen}>
        <View style={styles.sheetLayer}>
          <Pressable accessibilityLabel="Close details" onPress={() => setDetailsOpen(false)} style={styles.modalScrim} />
          <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <View style={styles.sheetHandle} />
            <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
              <View style={styles.viewerSection}>
                <Text numberOfLines={2} style={styles.viewerTitle}>
                  {item.title}
                </Text>
                <Text style={styles.bodyMuted}>
                  {item.time}
                  {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
                  {item.size ? ` · ${formatBytes(item.size)}` : ""}
                </Text>
              </View>

              <View style={styles.viewerSection}>
                <View style={styles.inlineStatusRow}>
                  <Text style={styles.overline}>Similar images</Text>
                  {isLoadingSimilar ? <ActivityIndicator color={colors.primary} size="small" /> : null}
                </View>
                {related.length ? (
                  <ScrollView
                    contentContainerStyle={styles.similarList}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    {related.map((hit) => (
                      <Pressable
                        accessibilityLabel={`Open ${hit.screenshot.title}`}
                        accessibilityRole="imagebutton"
                        disabled={!onOpenRelated}
                        key={hit.screenshot.id}
                        onPress={() => {
                          setDetailsOpen(false);
                          onOpenRelated?.(hit.screenshot);
                        }}
                        style={({ pressed }) => [styles.similarTile, pressed && styles.cardPressed]}
                      >
                        <Image source={{ uri: hit.screenshot.uri }} style={styles.similarImage} resizeMode="cover" />
                        <Text numberOfLines={1} style={styles.similarCaption}>
                          {hit.screenshot.category ?? hit.screenshot.title}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : isLoadingSimilar ? null : (
                  <Text style={styles.bodyMuted}>
                    {item.isIndexed
                      ? "Nothing else in your library looks like this one yet."
                      : "This image has not been processed yet, so there is nothing to compare it against."}
                  </Text>
                )}
              </View>

              <View style={styles.viewerSection}>
                <Text style={styles.overline}>Recognized text</Text>
                {detail.isLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : hasText ? (
                  <>
                    <Text style={styles.bodyMuted}>
                      {ocrConfidence}% confidence · {item.ocrLanguage === "und" ? "language undetermined" : item.ocrLanguage}
                    </Text>
                    <Text selectable style={styles.ocrText}>
                      {item.ocrText}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.bodyMuted}>
                    {item.isIndexed ? "No text was found in this image." : "This image has not been processed yet."}
                  </Text>
                )}
              </View>

              <View style={styles.viewerSection}>
                <Text style={styles.overline}>Metadata</Text>
                <MetadataRow label="Category" value={item.category ?? "Other"} />
                {confidence > 0 ? <MetadataRow label="Confidence" value={`${confidence}%`} /> : null}
                <MetadataRow label="Captured" value={formatTimestamp(item.createdAt)} />
                <MetadataRow label="Modified" value={formatTimestamp(item.modifiedAt)} />
                <MetadataRow
                  label="Dimensions"
                  value={item.width && item.height ? `${item.width} × ${item.height}` : "Unknown"}
                />
                <MetadataRow label="File size" value={item.size ? formatBytes(item.size) : "Unknown"} />
                <MetadataRow label="Folder" value={item.source} />
                {item.tags?.length ? (
                  <View style={styles.chipWrap}>
                    {item.tags.map((tag) => (
                      <View key={tag} style={styles.tagChip}>
                        <Text style={styles.tagChipText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.viewerSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.overline}>Add to category</Text>
                  {isMutating ? <ActivityIndicator color={colors.primary} size="small" /> : null}
                </View>
                {collections.length ? (
                  <View style={styles.chipWrap}>
                    {collections.map((collection) => {
                      const isMember = memberIds.has(collection.id);
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: isMember }}
                          key={collection.id}
                          onPress={() => onToggleMembership(collection.id, !isMember)}
                          style={[styles.chip, isMember && styles.selectedChip]}
                        >
                          <Ionicons
                            name={isMember ? "checkmark-circle" : "add-circle-outline"}
                            size={16}
                            color={isMember ? colors.primary : colors.muted}
                          />
                          <Text style={styles.chipText}>{collection.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.bodyMuted}>Create a category on the Categories tab to file this image.</Text>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function MenuItem({
  caption,
  disabled,
  icon,
  isDestructive,
  label,
  onPress
}: {
  caption: string;
  disabled?: boolean;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  isDestructive?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors, styles } = useTheme();

  return (
    <Pressable
      accessibilityRole="menuitem"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.viewerMenuItem,
        pressed && styles.viewerMenuItemPressed,
        disabled && styles.buttonDisabled
      ]}
    >
      <Ionicons name={icon} size={20} color={isDestructive ? colors.tertiary : colors.primary} />
      <View style={styles.flexOne}>
        <Text style={[styles.viewerMenuLabel, isDestructive && styles.viewerMenuLabelDanger]}>{label}</Text>
        <Text style={styles.viewerMenuCaption}>{caption}</Text>
      </View>
    </Pressable>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  const { styles } = useTheme();

  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metaValue}>
        {value}
      </Text>
    </View>
  );
}

function formatTimestamp(value?: number) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function touchDistance(a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}
