import React from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { ScreenshotCard } from "../../../shared/components/ScreenshotCard";
import { SectionTitle } from "../../../shared/components/SectionTitle";
import { colors } from "../../../shared/theme/colors";
import { styles } from "../../../shared/theme/styles";
import { useCollections } from "../../memory/hooks/useCollections";
import { useScreenshotGallery } from "../../screenshots/hooks/useScreenshotGallery";

export function CollectionsScreen() {
  const { data: collections } = useCollections();
  const { screenshots, loadMore } = useScreenshotGallery();

  return (
    <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      <View style={styles.pageIntro}>
        <View>
          <Text style={styles.pageTitle}>Your Collections</Text>
          <Text style={styles.bodyMuted}>Memory indexed and categorized by intent and context.</Text>
        </View>
        <Pressable style={styles.primaryButton}>
          <Ionicons name="folder-open" size={18} color={colors.onPrimary} />
          <Text style={styles.primaryButtonText}>New</Text>
        </Pressable>
      </View>

      <SectionTitle icon="sparkles" title="AI Suggested Groupings" />
      <View style={styles.suggestionCard}>
        <View style={styles.suggestionHeader}>
          <Text style={styles.badge}>Action Required</Text>
          <Text style={styles.bodyMuted}>48 New Items Found</Text>
        </View>
        <Text style={styles.cardTitle}>Project "Nebula" Sync</Text>
        <Text style={styles.cardBody}>The AI detected screenshots from Slack and research documents related to Project Nebula.</Text>
        <View style={styles.buttonRow}>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Merge to Work</Text>
          </Pressable>
          <Pressable style={styles.subtleButton}>
            <Text style={styles.subtleButtonText}>Dismiss</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.collectionGrid}>
        {collections.map((collection) => (
          <View key={collection.id} style={styles.collectionItem}>
            <View style={styles.collectionFolder}>
              <MaterialCommunityIcons name={collection.icon as React.ComponentProps<typeof MaterialCommunityIcons>["name"]} size={34} color={collection.color} />
              <Text style={styles.bodyMuted}>{collection.count} Items</Text>
            </View>
            <Text style={styles.collectionName}>{collection.name}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitleText}>Recently Added</Text>
        <Text style={styles.linkText}>View All</Text>
      </View>
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
    </ScrollView>
  );
}
