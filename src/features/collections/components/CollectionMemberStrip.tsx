import React from "react";
import { FlatList, Pressable, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { ScreenshotCard } from "../../../shared/components/ScreenshotCard";
import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";

type CollectionMemberStripProps = {
  screenshots: Screenshot[];
  onOpen: (shot: Screenshot) => void;
  /** Unfiles the image. The file itself is untouched, which the caller's wording should reflect. */
  onRemove: (shot: Screenshot) => void;
  onEndReached: () => void;
};

/**
 * The active category's images, each with an unfile button.
 *
 * Horizontal because it sits inside the screen's vertical ScrollView, where a vertical
 * VirtualizedList would fight the parent for scroll handling.
 */
export function CollectionMemberStrip({ screenshots, onOpen, onRemove, onEndReached }: CollectionMemberStripProps) {
  const { colors, styles } = useTheme();

  return (
    <FlatList
      horizontal
      contentContainerStyle={styles.horizontalList}
      data={screenshots}
      initialNumToRender={6}
      keyExtractor={(shot) => shot.id}
      maxToRenderPerBatch={8}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      removeClippedSubviews
      renderItem={({ item }) => (
        <View style={styles.memberCard}>
          <ScreenshotCard compact onPress={onOpen} shot={item} />
          <Pressable
            accessibilityLabel={`Remove ${item.title} from this category`}
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => onRemove(item)}
            style={styles.memberRemoveButton}
          >
            <Ionicons name="close" size={16} color={colors.text} />
          </Pressable>
        </View>
      )}
      showsHorizontalScrollIndicator={false}
      windowSize={5}
    />
  );
}
