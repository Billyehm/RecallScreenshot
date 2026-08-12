import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../../shared/theme/ThemeContext";
import { ChatScreen } from "../screens/ChatScreen";

type ChatModalProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * The AI conversation, presented over whatever tab you were on.
 *
 * A modal rather than a tab because asking a question is a detour from browsing, not a place you
 * live in — and because the transcript is deliberately not persisted, so returning to it later
 * would show an empty screen anyway. Mounted only while open for that same reason.
 */
export function ChatModal({ visible, onClose }: ChatModalProps) {
  const { colors, styles } = useTheme();

  if (!visible) return null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.fullScreenModal}>
        <View style={styles.modalTopBar}>
          <Pressable accessibilityLabel="Close AI search" accessibilityRole="button" onPress={onClose} style={styles.modalCloseButton}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.flexOne}>
            <Text numberOfLines={1} style={styles.viewerTitle}>
              Ask Recall AI
            </Text>
            <Text style={styles.bodyMuted}>On-device search, nothing leaves the phone</Text>
          </View>
        </View>

        <ChatScreen />
      </SafeAreaView>
    </Modal>
  );
}
