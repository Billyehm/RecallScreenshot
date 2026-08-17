import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

import { useTheme } from "../../../shared/theme/ThemeContext";
import { formatBytes, formatCount } from "../../../shared/utils/formatBytes";
import { DeviceImageAccessNotice } from "../../screenshots/components/DeviceImageAccessNotice";
import { useIndexScope } from "../../screenshots/hooks/useIndexScope";
import { useIndexStatus } from "../../screenshots/hooks/useIndexStatus";
import { useMediaFolders } from "../../screenshots/hooks/useMediaFolders";
import { useMediaPermission } from "../../screenshots/hooks/useMediaPermission";
import { useStorageInfo } from "../../screenshots/hooks/useStorageInfo";
import type { IndexScope } from "../../screenshots/native/ScreenshotMediaStore";
import { FolderScopeSheet } from "../components/FolderScopeSheet";
import { IndexScopeSheet } from "../components/IndexScopeSheet";
import { SettingsGroup, SettingsRow, SettingsSwitchRow } from "../components/SettingsRow";
import { useIndexControls } from "../hooks/useIndexControls";

/**
 * Privacy, indexing and storage — everything that changes what Recall keeps about the library.
 *
 * Every destructive action here confirms first and names what survives it, because "clear" and
 * "delete" next to an image library read as deleting images, and none of these do that.
 */
export function SettingsScreen() {
  const { colors, isDark, styles, toggleTheme } = useTheme();
  const { status: permissionStatus, isReadable, requestAccess, openSettings } = useMediaPermission();
  const index = useIndexStatus();
  const { storage, totalBytes, isLoading: isStorageLoading } = useStorageInfo(isReadable);
  const { folders, isLoading: areFoldersLoading } = useMediaFolders(isReadable);
  const { scope, isLoading: isScopeLoading } = useIndexScope();
  const {
    setPaused,
    setFolders,
    setScope,
    clearAiData,
    deleteDatabase,
    isPausing,
    isSavingFolders,
    isSavingScope,
    isClearing
  } = useIndexControls();
  const [isFolderSheetOpen, setFolderSheetOpen] = useState(false);
  const [isScopeSheetOpen, setScopeSheetOpen] = useState(false);

  const isPaused = index.state === "paused";
  const indexedFolderCount = folders.filter((folder) => folder.isIndexed).length;

  const report = (title: string, error: unknown) => {
    Alert.alert(title, error instanceof Error ? error.message : "The change was not applied.");
  };

  const togglePause = () => {
    setPaused(!isPaused).catch((error: unknown) => report("Could not change indexing", error));
  };

  const saveFolders = async (selected: string[]) => {
    try {
      await setFolders(selected);
    } catch (error) {
      report("Could not save folders", error);
      // Rethrown so the sheet stays open holding the selection rather than closing on a save that
      // did not happen.
      throw error;
    }
  };

  const saveScope = async (selected: IndexScope) => {
    try {
      await setScope(selected);
    } catch (error) {
      report("Could not change what is indexed", error);
      throw error;
    }
  };

  const confirmClearAiData = () => {
    Alert.alert(
      "Clear AI data?",
      "Recognized text, tags and search vectors are deleted, then rebuilt from your images. Your images and the categories you created are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            clearAiData().catch((error: unknown) => report("Could not clear AI data", error));
          }
        }
      ]
    );
  };

  const confirmDeleteDatabase = () => {
    Alert.alert(
      "Delete the index?",
      "Everything Recall has stored is removed, including the categories you created. No images are deleted. Indexing stays paused until you turn it back on.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteDatabase().catch((error: unknown) => report("Could not delete the index", error));
          }
        }
      ]
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
        <View style={styles.pageIntroCopy}>
          <Text style={styles.pageTitle}>Settings</Text>
          <Text style={styles.bodyMuted}>
            Recall runs entirely on this device. Nothing it reads, indexes or infers leaves it.
          </Text>
        </View>

        <DeviceImageAccessNotice status={permissionStatus} onRequestAccess={requestAccess} onOpenSettings={openSettings} />

        <SettingsGroup title="Indexing" caption="Reading your library happens in the background, in batches, while charging is not required.">
          <SettingsSwitchRow
            busy={isPausing}
            icon={isPaused ? "pause-circle-outline" : "sync-outline"}
            onToggle={togglePause}
            subtitle={
              isPaused
                ? "Paused. Nothing new is being read or processed."
                : index.state === "running"
                  ? `Running${index.pending ? ` — ${formatCount(index.pending)} left in the queue` : ""}`
                  : "Idle. New images are picked up as they appear."
            }
            title="Index new images"
            value={!isPaused}
          />
          <SettingsRow
            busy={isScopeLoading}
            icon="images-outline"
            onPress={() => setScopeSheetOpen(true)}
            subtitle={scope === "allImages" ? "Every image on this device" : "Only screenshots"}
            title="What to index"
          />
          <SettingsRow
            icon="folder-outline"
            onPress={() => setFolderSheetOpen(true)}
            subtitle={
              indexedFolderCount
                ? `${formatCount(indexedFolderCount)} of ${formatCount(folders.length)} folders on this device`
                : "Choose which folders Recall is allowed to read"
            }
            title="Folders to index"
          />
          <SettingsRow
            icon="phone-portrait-outline"
            subtitle="Visible through Android photo access"
            title="Images on phone"
            value={formatCount(index.deviceImages)}
          />
          <SettingsRow
            icon="funnel-outline"
            subtitle="Match your image type and folder choices"
            title="Images indexable"
            value={formatCount(index.indexable)}
          />
          <SettingsRow
            icon="checkmark-done-outline"
            subtitle={index.failed && index.lastError
              ? `${formatCount(index.pending)} queued · ${formatCount(index.failed)} failed · ${index.lastError}`
              : `${formatCount(index.pending)} queued · ${formatCount(index.failed)} failed`}
            title="Images indexed"
            value={formatCount(index.indexed)}
          />
        </SettingsGroup>

        <SettingsGroup title="Privacy" caption="Recall has no network access. These controls decide what it keeps locally.">
          <SettingsRow
            busy={isClearing}
            destructive
            icon="sparkles-outline"
            onPress={confirmClearAiData}
            subtitle="Delete recognized text, tags and vectors, then rebuild them"
            title="Clear AI data"
          />
          <SettingsRow
            busy={isClearing}
            destructive
            icon="trash-outline"
            onPress={confirmDeleteDatabase}
            subtitle="Remove the entire index, including your categories. No images are deleted."
            title="Delete the index"
          />
        </SettingsGroup>

        <SettingsGroup
          title="Storage"
          caption="Your images are referenced where they already sit, never copied, so they are not counted here."
        >
          <SettingsRow
            busy={isStorageLoading}
            icon="server-outline"
            subtitle="Index, recognized text and thumbnails"
            title="On-device total"
            value={formatBytes(totalBytes)}
          />
          <SettingsRow
            icon="document-text-outline"
            subtitle={`${formatCount(storage.ocrRecords)} text records · ${formatCount(storage.tokens)} terms`}
            title="Database"
            value={formatBytes(storage.databaseBytes)}
          />
          <SettingsRow
            icon="image-outline"
            subtitle={`Previews for ${formatCount(storage.indexedImages)} images`}
            title="Thumbnails"
            value={formatBytes(storage.thumbnailBytes)}
          />
          <SettingsRow
            icon="git-network-outline"
            subtitle="Vectors that make meaning-based search work offline"
            title="Search vectors"
            value={formatCount(storage.embeddings)}
          />
        </SettingsGroup>

        <SettingsGroup title="Appearance">
          <SettingsSwitchRow
            icon="moon-outline"
            onToggle={toggleTheme}
            subtitle={isDark ? "On" : "Off"}
            title="Dark mode"
            value={isDark}
          />
        </SettingsGroup>

        <Text style={styles.bodyMuted}>Recall {`·`} on-device image memory</Text>
      </ScrollView>

      {/* Mounted only while open so they do not hold state behind the screen. */}
      {isScopeSheetOpen ? (
        <IndexScopeSheet
          isSaving={isSavingScope}
          onClose={() => setScopeSheetOpen(false)}
          onSave={saveScope}
          scope={scope}
          visible
        />
      ) : null}

      {isFolderSheetOpen ? (
        <FolderScopeSheet
          folders={folders}
          isLoading={areFoldersLoading}
          isSaving={isSavingFolders}
          onClose={() => setFolderSheetOpen(false)}
          onSave={saveFolders}
          visible
        />
      ) : null}
    </>
  );
}
