import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import type { UserCollection } from "../domain/collection";
import type { CollectionSuggestion } from "../domain/collectionSuggestion";

type CollectionSuggestionCardProps = {
  suggestion: CollectionSuggestion;
  /** Existing collections, used both for the merge picker and to spot a name collision. */
  collections: UserCollection[];
  isFiling: boolean;
  onCreate: (suggestion: CollectionSuggestion) => void;
  onMerge: (collectionId: string, suggestion: CollectionSuggestion) => void;
  onDismiss: (suggestionId: string) => void;
};

/**
 * One clustered group of unfiled images, with the two ways to act on it.
 *
 * Everything shown is derived on device: the name comes from the terms that distinguish this cluster
 * from the rest of the library, and the image is the cluster medoid rather than a fixed asset.
 */
export function CollectionSuggestionCard({
  suggestion,
  collections,
  isFiling,
  onCreate,
  onMerge,
  onDismiss
}: CollectionSuggestionCardProps) {
  const { colors, styles } = useTheme();
  const [isPickerOpen, setPickerOpen] = useState(false);

  // A generated name can collide with a collection the user already made. Filing into that one is
  // what they meant, so the primary action says so instead of offering a create that cannot happen.
  const nameMatch = useMemo(
    () => collections.find((collection) => collection.name.toLowerCase() === suggestion.name.trim().toLowerCase()),
    [collections, suggestion.name]
  );

  const keywordLine = suggestion.keywords.length ? suggestion.keywords.join(" - ") : suggestion.category.toLowerCase();

  return (
    <View style={styles.suggestionCard}>
      <View style={styles.suggestionHeader}>
        <Text style={styles.overlinePrimary}>Suggested</Text>
        <View style={styles.inlineStatusRow}>
          <Text style={styles.badge}>{suggestion.size} unfiled</Text>
          <Pressable
            accessibilityLabel={`Dismiss the ${suggestion.name} suggestion`}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onDismiss(suggestion.id)}
          >
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.modalTitle}>{suggestion.name}</Text>
      <Text style={styles.bodyMuted}>
        {suggestion.size} images cluster together around {keywordLine}
      </Text>

      {suggestion.representativeUri ? (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={`Representative image for ${suggestion.name}`}
          source={{ uri: suggestion.representativeUri }}
          style={styles.suggestionThumb}
          resizeMode="cover"
        />
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          disabled={isFiling}
          onPress={() => (nameMatch ? onMerge(nameMatch.id, suggestion) : onCreate(suggestion))}
          style={[styles.primaryButton, isFiling && styles.buttonDisabled]}
        >
          {isFiling ? <ActivityIndicator color={colors.onPrimary} size="small" /> : null}
          <Text style={styles.primaryButtonText}>{nameMatch ? `Add to ${nameMatch.name}` : "Create Collection"}</Text>
        </Pressable>
        {collections.length ? (
          <Pressable
            accessibilityRole="button"
            disabled={isFiling}
            onPress={() => setPickerOpen(true)}
            style={[styles.subtleButton, isFiling && styles.buttonDisabled]}
          >
            <Text style={styles.subtleButtonText}>Merge into...</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal animationType="fade" transparent visible={isPickerOpen} onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalLayer}>
          <Pressable accessibilityLabel="Close category picker" onPress={() => setPickerOpen(false)} style={styles.modalScrim} />
          <View accessibilityViewIsModal style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>Merge into</Text>
                <Text style={styles.bodyMuted}>
                  File these {suggestion.size} images into a category you already have.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                onPress={() => setPickerOpen(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              <View style={styles.menuSection}>
                {collections.map((collection) => (
                  <Pressable
                    accessibilityRole="button"
                    key={collection.id}
                    onPress={() => {
                      setPickerOpen(false);
                      onMerge(collection.id, suggestion);
                    }}
                    style={({ pressed }) => [styles.menuItem, pressed && styles.cardPressed]}
                  >
                    <Ionicons name="folder-outline" size={18} color={colors.primary} />
                    <Text numberOfLines={1} style={[styles.menuItemText, styles.flexOne]}>
                      {collection.name}
                    </Text>
                    <Text style={styles.countBadge}>{collection.count}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

