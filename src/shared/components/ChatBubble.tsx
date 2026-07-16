import React from "react";
import { Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { colors } from "../theme/colors";
import { styles } from "../theme/styles";

type ChatBubbleProps = {
  role: "ai" | "user";
  text: string;
};

export function ChatBubble({ role, text }: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <View style={[styles.messageRow, isUser && styles.userMessageRow]}>
      <View style={[styles.messageIcon, isUser ? styles.userIcon : styles.botIcon]}>
        <Ionicons name={isUser ? "person" : "sparkles"} size={17} color={isUser ? colors.muted : colors.primary} />
      </View>
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.messageText, isUser && styles.userMessageText]}>{text}</Text>
      </View>
    </View>
  );
}
