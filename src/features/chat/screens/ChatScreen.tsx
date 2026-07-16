import React, { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { ChatBubble } from "../../../shared/components/ChatBubble";
import { colors } from "../../../shared/theme/colors";
import { styles } from "../../../shared/theme/styles";
import { useChatMessages } from "../../memory/hooks/useChatMessages";

export function ChatScreen() {
  const [draft, setDraft] = useState("");
  const { data: messages } = useChatMessages();

  return (
    <View style={styles.chatShell}>
      <ScrollView contentContainerStyle={styles.chatContent} showsVerticalScrollIndicator={false}>
        <View style={styles.datePill}>
          <Text style={styles.overline}>Today</Text>
        </View>
        {messages.map((message) => (
          <ChatBubble key={message.id} role={message.role} text={message.text} />
        ))}
        <View style={styles.typingRow}>
          <View style={styles.botIcon}>
            <MaterialCommunityIcons name="auto-fix" size={18} color={colors.primary} />
          </View>
          <View style={styles.typingBubble}>
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
            <View style={styles.typingDot} />
          </View>
        </View>
      </ScrollView>

      <View style={styles.chatComposer}>
        <MaterialCommunityIcons name="tune-variant" size={20} color={colors.secondary} />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask AI about your memory..."
          placeholderTextColor="rgba(203,195,215,0.55)"
          style={styles.composerInput}
        />
        <Ionicons name="mic-outline" size={20} color={colors.secondary} />
        <Pressable style={styles.sendButton}>
          <Ionicons name="send" size={16} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
