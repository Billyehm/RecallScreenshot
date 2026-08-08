import React, { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { ScreenshotCard } from "../../../shared/components/ScreenshotCard";
import { SectionTitle } from "../../../shared/components/SectionTitle";
import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Collection } from "../../../shared/types/recall";
import { useCollections } from "../../memory/hooks/useCollections";
import { useScreenshotGallery } from "../../screenshots/hooks/useScreenshotGallery";
import { DeviceImageAccessNotice } from "../../screenshots/components/DeviceImageAccessNotice";

export function CollectionsScreen() {
  const { data: collections } = useCollections();
  const { screenshots, hasNextPage, loadMore, permissionStatus, requestAccess, openSettings } = useScreenshotGallery();
  const { colors, styles } = useTheme();
  const [createdCollections, setCreatedCollections] = useState<Collection[]>([]);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState("");
  const [createError, setCreateError] = useState("");
  const [isSuggestionVisible, setSuggestionVisible] = useState(true);
  const [suggestionResult, setSuggestionResult] = useState("");
  const [hasMergedSuggestion, setHasMergedSuggestion] = useState(false);
  const collectionColors = [colors.primary, colors.secondary, colors.tertiary, colors.primary, colors.muted];
  const visibleCollections = useMemo(
    () => [
      ...collections.map((collection) =>
        collection.id === "work" && hasMergedSuggestion ? { ...collection, count: collection.count + 48 } : collection
      ),
      ...createdCollections
    ],
    [collections, createdCollections, hasMergedSuggestion]
  );

  const closeCreateModal = () => {
    setCreateOpen(false);
    setCollectionDraft("");
    setCreateError("");
  };

  const createCollection = () => {
    const name = collectionDraft.trim();
    if (!name) {
      setCreateError("Enter a collection name.");
      return;
    }

    const isDuplicate = visibleCollections.some((collection) => collection.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
      setCreateError("A collection with this name already exists.");
      return;
    }

    setCreatedCollections((current) => [
      ...current,
      {
        id: `collection-${Date.now()}`,
        name,
        count: 0,
        icon: "folder-outline",
        color: colors.primary
      }
    ]);
    closeCreateModal();
  };

  const mergeSuggestion = () => {
    setHasMergedSuggestion(true);
    setSuggestionVisible(false);
    setSuggestionResult('48 items were merged into "Work".');
  };

  const dismissSuggestion = () => {
    setSuggestionVisible(false);
    setSuggestionResult("Suggestion dismissed.");
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageIntro}>
          <View style={styles.pageIntroCopy}>
            <Text style={styles.pageTitle}>Your Collections</Text>
            <Text style={styles.bodyMuted}>Memory indexed and categorized by intent and context.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setCreateOpen(true)} style={styles.primaryButton}>
            <Ionicons name="folder-open" size={18} color={colors.onPrimary} />
            <Text style={styles.primaryButtonText}>New</Text>
          </Pressable>
        </View>

        <DeviceImageAccessNotice status={permissionStatus} onRequestAccess={requestAccess} onOpenSettings={openSettings} />

        <SectionTitle icon="sparkles" title="AI Suggested Groupings" />
        {isSuggestionVisible ? (
          <View style={styles.suggestionCard}>
            <View style={styles.suggestionHeader}>
              <Text style={styles.badge}>Action Required</Text>
              <Text style={styles.bodyMuted}>48 New Items Found</Text>
            </View>
            <Text style={styles.cardTitle}>Project "Nebula" Sync</Text>
            <Text style={styles.cardBody}>The AI detected images from Slack and research documents related to Project Nebula.</Text>
            <View style={styles.buttonRow}>
              <Pressable accessibilityRole="button" onPress={mergeSuggestion} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Merge to Work</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={dismissSuggestion} style={styles.subtleButton}>
                <Text style={styles.subtleButtonText}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View accessibilityRole="alert" style={styles.actionNotice}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={styles.actionNoticeText}>{suggestionResult}</Text>
          </View>
        )}

        <View style={styles.collectionGrid}>
          {visibleCollections.map((collection, index) => (
            <View key={collection.id} style={styles.collectionItem}>
              <View style={styles.collectionFolder}>
                <MaterialCommunityIcons
                  name={collection.icon as React.ComponentProps<typeof MaterialCommunityIcons>["name"]}
                  size={34}
                  color={collectionColors[index % collectionColors.length]}
                />
                <Text style={styles.bodyMuted}>{collection.count} Items</Text>
              </View>
              <Text style={styles.collectionName}>{collection.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleText}>Recently Added</Text>
          {screenshots.length > 0 && hasNextPage ? (
            <Pressable accessibilityRole="button" onPress={loadMore} style={styles.linkButton}>
              <Text style={styles.linkText}>View More</Text>
            </Pressable>
          ) : null}
        </View>
        {screenshots.length ? (
          <FlatList
            horizontal
            data={screenshots}
            keyExtractor={(shot) => shot.id}
            renderItem={({ item }) => <ScreenshotCard shot={item} compact />}
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
            <Ionicons name="images-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyGalleryTitle}>No images indexed</Text>
            <Text style={styles.emptyGalleryBody}>Your device images will be available here once indexing completes.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal animationType="fade" transparent visible={isCreateOpen} onRequestClose={closeCreateModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalLayer}>
          <Pressable accessibilityLabel="Close new collection dialog" onPress={closeCreateModal} style={styles.modalScrim} />
          <View accessibilityViewIsModal style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>New Collection</Text>
                <Text style={styles.bodyMuted}>Create a place for related memories.</Text>
              </View>
              <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={closeCreateModal} style={styles.modalCloseButton}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            <TextInput
              autoFocus
              maxLength={48}
              onChangeText={(value) => {
                setCollectionDraft(value);
                if (createError) setCreateError("");
              }}
              onSubmitEditing={createCollection}
              placeholder="Collection name"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              style={styles.modalInput}
              value={collectionDraft}
            />
            {createError ? <Text style={styles.inputError}>{createError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={closeCreateModal} style={styles.subtleButton}>
                <Text style={styles.subtleButtonText}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={createCollection} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
