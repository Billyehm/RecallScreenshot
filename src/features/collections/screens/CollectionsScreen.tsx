import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { SmartScreenshotCarousel } from "../../../shared/components/SmartScreenshotCarousel";
import { SectionTitle } from "../../../shared/components/SectionTitle";
import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";
import { useScreenshotGallery } from "../../screenshots/hooks/useScreenshotGallery";
import { DeviceImageAccessNotice } from "../../screenshots/components/DeviceImageAccessNotice";
import { ScreenshotViewer } from "../../screenshots/components/ScreenshotViewer";
import { CollectionPicker } from "../components/CollectionPicker";
import { CollectionSuggestionCard } from "../components/CollectionSuggestionCard";
import { useCollectionLibrary } from "../hooks/useCollectionLibrary";
import { useCollectionMembers } from "../hooks/useCollectionMembers";
import { useCollectionSuggestions } from "../hooks/useCollectionSuggestions";

export function CollectionsScreen() {
  const { colors, styles } = useTheme();
  const { collections, createCollection, removeCollection, setMembership, setBatchMembership, isMutating } =
    useCollectionLibrary();
  const { suggestions, createFromSuggestion, mergeIntoCollection, dismissSuggestion, isFiling } =
    useCollectionSuggestions();
  const [activeCollectionId, setActiveCollectionId] = useState<string | undefined>();
  const { screenshots, hasNextPage, loadMore, permissionStatus, requestAccess, openSettings } = useScreenshotGallery({
    filter: { collectionId: activeCollectionId }
  });
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState("");
  const [createError, setCreateError] = useState("");
  const [openedShot, setOpenedShot] = useState<Screenshot | null>(null);
  const activeCollection = useMemo(
    () => collections.find((collection) => collection.id === activeCollectionId),
    [activeCollectionId, collections]
  );
  const memberIds = useCollectionMembers(activeCollectionId);

  const closeCreateModal = () => {
    setCreateOpen(false);
    setCollectionDraft("");
    setCreateError("");
  };

  const submitCollection = async () => {
    if (isMutating) return;
    const name = collectionDraft.trim();
    if (!name) {
      setCreateError("Enter a category name.");
      return;
    }

    try {
      const created = await createCollection(name);
      setActiveCollectionId(created.id);
      closeCreateModal();
    } catch (error) {
      // The repository owns uniqueness, so the message it raises is the one worth showing.
      setCreateError(error instanceof Error ? error.message : "Could not create this category.");
    }
  };

  const toggleCollection = (id: string) => {
    setActiveCollectionId((current) => (current === id ? undefined : id));
  };

  /**
   * Disbanding drops the grouping, not the images — the confirmation says so, because "delete" next
   * to a folder full of photos reads as deleting the photos.
   */
  const confirmDisband = (id: string, name: string, count: number) => {
    Alert.alert(
      `Disband "${name}"?`,
      count
        ? `The category will be removed. The ${count} image${count === 1 ? "" : "s"} in it stay on your device.`
        : "The category will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disband",
          style: "destructive",
          onPress: () => {
            if (id === activeCollectionId) setActiveCollectionId(undefined);
            removeCollection(id).catch((error: Error) => {
              Alert.alert("Could not disband", error.message);
            });
          }
        }
      ]
    );
  };

  const unfile = (collectionId: string, shot: Screenshot) => {
    setMembership({ collectionId, screenshotId: shot.id, member: false }).catch((error: Error) => {
      Alert.alert("Could not remove", error.message);
    });
  };

  const saveMembership = async (collectionId: string, added: string[], removed: string[]) => {
    try {
      await setBatchMembership({ collectionId, added, removed });
    } catch (error) {
      Alert.alert("Could not save changes", error instanceof Error ? error.message : "The change was not saved.");
      // Rethrown so the picker knows to stay open holding the selection rather than closing on a
      // save that did not happen.
      throw error;
    }
  };

  const openPickerFor = (id: string) => {
    setActiveCollectionId(id);
    setPickerOpen(true);
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageIntro}>
          <View style={styles.pageIntroCopy}>
            <Text style={styles.pageTitle}>Your Categories</Text>
            <Text style={styles.bodyMuted}>Group images into categories you control. Everything stays on this device.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setCreateOpen(true)} style={styles.primaryButton}>
            <Ionicons name="folder-open" size={18} color={colors.onPrimary} />
            <Text style={styles.primaryButtonText}>New</Text>
          </Pressable>
        </View>

        <DeviceImageAccessNotice status={permissionStatus} onRequestAccess={requestAccess} onOpenSettings={openSettings} />

        {/* Clusters the indexer found among images that are in no category yet. Absent until there
            is a real grouping to offer, which is why there is no empty state for it. */}
        {suggestions.map((suggestion) => (
          <CollectionSuggestionCard
            collections={collections}
            isFiling={isFiling}
            key={suggestion.id}
            onCreate={(target) => {
              createFromSuggestion(target).catch(() => {
                // Filing failed, so the card stays: retrying is the useful next step.
              });
            }}
            onDismiss={dismissSuggestion}
            onMerge={(collectionId, target) => {
              mergeIntoCollection({ collectionId, suggestion: target }).catch(() => {
                // Same reasoning as create: leave the card in place rather than losing the grouping.
              });
            }}
            suggestion={suggestion}
          />
        ))}

        <SectionTitle icon="albums-outline" title="Categories You Created" />
        {collections.length ? (
          <View style={styles.collectionGrid}>
            {collections.map((collection) => {
              const isActive = collection.id === activeCollectionId;
              return (
                <View key={collection.id} style={styles.collectionItem}>
                  <Pressable
                    accessibilityLabel={`Show images in ${collection.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    onPress={() => toggleCollection(collection.id)}
                    style={[styles.collectionFolder, isActive && styles.collectionFolderActive]}
                  >
                    <Text numberOfLines={1} style={styles.collectionName}>{collection.name}</Text>
                    <Text style={styles.collectionCount}>
                      {collection.count} Item{collection.count === 1 ? "" : "s"}
                    </Text>
                    <Ionicons name={isActive ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyGallery}>
            <Ionicons name="folder-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyGalleryTitle}>No categories yet</Text>
            <Text style={styles.emptyGalleryBody}>Create a category, then open any image to file it here.</Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View style={styles.flexOne}>
            <Text style={styles.sectionTitleText}>{activeCollection ? activeCollection.name : "Recently Added"}</Text>
            <Text style={styles.bodyMuted}>
              {activeCollection
                ? "Tap an image to view it, or the cross to remove it from this category."
                : "Tap an image to view it and file it."}
            </Text>
          </View>
          {activeCollection ? (
            <View style={styles.collectionActionRow}>
              <Pressable accessibilityLabel={`Add images to ${activeCollection.name}`} accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.primaryButton}>
                <Ionicons name="add" size={18} color={colors.onPrimary} />
                <Text style={styles.primaryButtonText}>Add images</Text>
              </Pressable>
              <Pressable accessibilityLabel={`Disband ${activeCollection.name}`} accessibilityRole="button" onPress={() => confirmDisband(activeCollection.id, activeCollection.name, activeCollection.count)} style={styles.subtleButton}>
                <Text style={styles.subtleButtonText}>Disband</Text>
              </Pressable>
            </View>
          ) : screenshots.length > 0 && hasNextPage ? (
            <Pressable accessibilityRole="button" onPress={loadMore} style={styles.linkButton}>
              <Text style={styles.linkText}>View More</Text>
            </Pressable>
          ) : null}
        </View>
        {screenshots.length ? (
          <SmartScreenshotCarousel
            screenshots={screenshots}
            onOpen={setOpenedShot}
            onEndReached={loadMore}
            renderOverlay={activeCollection ? (shot) => (
              <Pressable accessibilityLabel={`Remove ${shot.title} from this category`} accessibilityRole="button" onPress={() => unfile(activeCollection.id, shot)} style={styles.memberRemoveButton}>
                <Ionicons name="close" size={16} color={colors.text} />
              </Pressable>
            ) : undefined}
          />
        ) : permissionStatus === "granted" || permissionStatus === "limited" ? (
          <View style={styles.emptyGallery}>
            <Ionicons name="images-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyGalleryTitle}>{activeCollection ? "This category is empty" : "No images indexed"}</Text>
            <Text style={styles.emptyGalleryBody}>
              {activeCollection
                ? "Use Add to pick images for this category, or open any image and file it here."
                : "Your device images will be available here once indexing completes."}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal animationType="fade" transparent visible={isCreateOpen} onRequestClose={closeCreateModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalLayer}>
          <Pressable accessibilityLabel="Close new category dialog" onPress={closeCreateModal} style={styles.modalScrim} />
          <View accessibilityViewIsModal style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleWrap}>
                <Text style={styles.modalTitle}>New Category</Text>
                <Text style={styles.bodyMuted}>Create a place for related images.</Text>
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
              onSubmitEditing={submitCollection}
              placeholder="Category name"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              style={styles.modalInput}
              value={collectionDraft}
            />
            {createError ? <Text style={styles.inputError}>{createError}</Text> : null}
            <View style={styles.modalActions}>
              {isMutating ? <ActivityIndicator color={colors.primary} size="small" /> : null}
              <Pressable accessibilityRole="button" onPress={closeCreateModal} style={styles.subtleButton}>
                <Text style={styles.subtleButtonText}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isMutating} onPress={submitCollection} style={[styles.primaryButton, isMutating && styles.buttonDisabled]}>
                <Text style={styles.primaryButtonText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Mounted only while open so it does not page a second copy of the library behind the screen. */}
      {isPickerOpen && activeCollection ? (
        <CollectionPicker
          collectionName={activeCollection.name}
          isSaving={isMutating}
          memberIds={memberIds}
          onClose={() => setPickerOpen(false)}
          onSave={({ added, removed }) => saveMembership(activeCollection.id, added, removed)}
          visible
        />
      ) : null}

      <ScreenshotViewer screenshots={screenshots} screenshot={openedShot} onClose={() => setOpenedShot(null)} onOpenRelated={setOpenedShot} />
    </>
  );
}
