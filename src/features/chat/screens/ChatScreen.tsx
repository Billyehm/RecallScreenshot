import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { ChatBubble } from "../../../shared/components/ChatBubble";
import { ScreenshotCard } from "../../../shared/components/ScreenshotCard";
import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";
import { ScreenshotViewer } from "../../screenshots/components/ScreenshotViewer";
import { useIndexStatus } from "../../screenshots/hooks/useIndexStatus";
import type { SearchHit } from "../../search/domain/searchResult";
import { useConversation } from "../hooks/useConversation";

/** Shown before the first question. Phrased as things this index can actually answer. */
const EXAMPLE_QUESTIONS = [
  "the receipt from the hardware store",
  "screenshots with a phone number",
  "that error message from last week"
];

/**
 * Ask the library in plain language.
 *
 * Answers come from the same on-device ranker the search screen uses, so this screen invents
 * nothing: it says how many images matched and shows them. Nothing typed here leaves the device,
 * and the transcript is never written to disk.
 */
export function ChatScreen() {
  const [draft, setDraft] = useState("");
  const [openedShot, setOpenedShot] = useState<Screenshot | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { colors, styles } = useTheme();
  const { messages, isAnswering, ask, chooseClarification } = useConversation();
  const index = useIndexStatus();
  const answerImages = messages.flatMap((message) => message.hits?.map((hit) => hit.screenshot) ?? []);

  const send = (text = draft) => {
    if (!text.trim() || isAnswering) return;
    setDraft("");
    void ask(text);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.chatShell}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.chatContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        style={styles.chatList}
      >
        {messages.length ? (
          messages.map((message) => (
            <View key={message.id} style={styles.answerBlock}>
              <ChatBubble role={message.role} text={message.text} />
              {message.choices?.length ? (
                <View style={styles.clarificationChoices}>
                  {message.choices.map((choice, index) => (
                    <Pressable
                      accessibilityRole="button"
                      key={choice.label}
                      onPress={() => chooseClarification(message.id, choice.query)}
                      style={[styles.filterOption, index === 0 && styles.filterOptionActive]}
                    >
                      <Ionicons name={index === 0 ? "sparkles-outline" : "return-down-forward-outline"} size={17} color={index === 0 ? colors.primary : colors.muted} />
                      <Text style={styles.filterOptionText}>{choice.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {message.hits?.length ? <AnswerResults hits={message.hits} onOpen={setOpenedShot} /> : null}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.messageIcon, styles.botIcon]}>
              <MaterialCommunityIcons name="auto-fix" size={20} color={colors.primary} />
            </View>
            <Text style={styles.emptyGalleryTitle}>Ask about your images</Text>
            <Text style={styles.emptyGalleryBody}>
              {index.isEmpty
                ? "Recall is still reading your library. Answers get better as more images finish indexing."
                : `Searching ${index.indexed.toLocaleString()} indexed images on this device. Nothing you type here leaves it.`}
            </Text>
            <View style={styles.chipWrap}>
              {EXAMPLE_QUESTIONS.map((example) => (
                <Pressable accessibilityRole="button" key={example} onPress={() => send(example)} style={styles.filterOption}>
                  <Text style={styles.filterOptionText}>{example}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {isAnswering ? (
          <View style={styles.typingRow}>
            <View style={[styles.messageIcon, styles.botIcon]}>
              <MaterialCommunityIcons name="auto-fix" size={18} color={colors.primary} />
            </View>
            <TypingDots />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.chatComposer}>
        <MaterialCommunityIcons name="auto-fix" size={20} color={colors.secondary} />
        <TextInput
          editable={!isAnswering}
          maxLength={1000}
          onSubmitEditing={() => send()}
          value={draft}
          onChangeText={setDraft}
          placeholder="Describe an image you are looking for..."
          placeholderTextColor={colors.placeholder}
          returnKeyType="search"
          style={styles.composerInput}
        />
        <Pressable
          accessibilityLabel="Search your library"
          accessibilityRole="button"
          disabled={!draft.trim() || isAnswering}
          onPress={() => send()}
          style={[styles.sendButton, (!draft.trim() || isAnswering) && styles.sendButtonDisabled]}
        >
          <Ionicons name="send" size={16} color={colors.onPrimary} />
        </Pressable>
      </View>

      <ScreenshotViewer screenshots={answerImages} onClose={() => setOpenedShot(null)} onOpenRelated={setOpenedShot} screenshot={openedShot} />
    </KeyboardAvoidingView>
  );
}

type AnswerResultsProps = {
  hits: SearchHit[];
  onOpen: (shot: Screenshot) => void;
};

/**
 * The images an answer is made of.
 *
 * Horizontal because the transcript is already a vertical scroll container, and a nested vertical
 * list would leave both of them fighting for the same gesture. Memoized because every earlier
 * answer re-renders when a new one is appended, and their hits never change once written.
 */
const AnswerResults = React.memo(function AnswerResults({ hits, onOpen }: AnswerResultsProps) {
  const { styles } = useTheme();

  const renderHit = useCallback(
    ({ item }: { item: SearchHit }) => <ScreenshotCard compact onPress={onOpen} shot={item.screenshot} />,
    [onOpen]
  );

  return (
    <FlatList
      horizontal
      contentContainerStyle={styles.horizontalList}
      data={hits}
      initialNumToRender={3}
      keyExtractor={(hit) => hit.screenshot.id}
      removeClippedSubviews
      renderItem={renderHit}
      showsHorizontalScrollIndicator={false}
      windowSize={3}
    />
  );
});

function TypingDots() {
  const { styles } = useTheme();
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const animations = dots.map((dot, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * 140),
      Animated.timing(dot, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(dot, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.delay((2 - index) * 140)
    ])));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  return (
    <View style={styles.typingBubble}>
      {dots.map((dot, index) => (
        <Animated.View key={index} style={[styles.typingDot, { opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }), transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }]} />
      ))}
    </View>
  );
}
