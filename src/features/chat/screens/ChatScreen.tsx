import React, { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { ChatBubble } from "../../../shared/components/ChatBubble";
import { useTheme } from "../../../shared/theme/ThemeContext";
import type { ChatMessage } from "../../../shared/types/recall";
import { useChatMessages } from "../../memory/hooks/useChatMessages";

export function ChatScreen() {
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [isResponding, setResponding] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: messages } = useChatMessages();
  const { colors, styles } = useTheme();
  const visibleMessages = useMemo(() => [...messages, ...localMessages], [localMessages, messages]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
    };
  }, []);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || isResponding) return;

    const id = Date.now();
    setLocalMessages((current) => [...current, { id: `user-${id}`, role: "user", text }]);
    setDraft("");
    setResponding(true);

    responseTimerRef.current = setTimeout(() => {
      setLocalMessages((current) => [
        ...current,
        {
          id: `ai-${id}`,
          role: "ai",
          text: `I received your request: "${text}". Semantic retrieval is not connected in this local build yet, but your message was added to the conversation.`
        }
      ]);
      setResponding(false);
      responseTimerRef.current = null;
    }, 650);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.chatShell, isKeyboardVisible && styles.chatShellKeyboard]}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.chatContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
        style={styles.chatList}
      >
        <View style={styles.datePill}>
          <Text style={styles.overline}>Today</Text>
        </View>
        {visibleMessages.map((message) => (
          <ChatBubble key={message.id} role={message.role} text={message.text} />
        ))}
        {isResponding ? (
          <View style={styles.typingRow}>
            <View style={[styles.messageIcon, styles.botIcon]}>
              <MaterialCommunityIcons name="auto-fix" size={18} color={colors.primary} />
            </View>
            <View style={styles.typingBubble}>
              <View style={styles.typingDot} />
              <View style={styles.typingDot} />
              <View style={styles.typingDot} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.chatComposer}>
        <MaterialCommunityIcons name="auto-fix" size={20} color={colors.secondary} />
        <TextInput
          editable={!isResponding}
          maxLength={1000}
          onSubmitEditing={sendMessage}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask AI about your memory..."
          placeholderTextColor={colors.placeholder}
          returnKeyType="send"
          style={styles.composerInput}
        />
        <Pressable
          accessibilityLabel="Send message"
          accessibilityRole="button"
          disabled={!draft.trim() || isResponding}
          onPress={sendMessage}
          style={[styles.sendButton, (!draft.trim() || isResponding) && styles.sendButtonDisabled]}
        >
          <Ionicons name="send" size={16} color={colors.onPrimary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
