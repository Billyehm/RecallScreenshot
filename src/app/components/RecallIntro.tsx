import React, { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { useTheme } from "../../shared/theme/ThemeContext";

export function RecallIntro({ onFinish }: { onFinish: () => void }) {
  const { colors, styles } = useTheme();
  const mark = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.spring(mark, { toValue: 1, tension: 54, friction: 8, useNativeDriver: true }),
      Animated.delay(300),
      Animated.timing(tagline, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.delay(650)
    ]);
    animation.start(({ finished }) => finished && onFinish());
    return () => animation.stop();
  }, [mark, onFinish, tagline]);

  return (
    <View style={styles.introStage}>
      <Animated.View style={[styles.introBrand, { opacity: mark, transform: [{ scale: mark }] }]}>
        <View style={styles.introMark}>
          <MaterialCommunityIcons name="memory" size={38} color={colors.primary} />
        </View>
        <Text style={styles.introTitle}>RECALL</Text>
      </Animated.View>
      <Animated.Text
        style={[
          styles.introTagline,
          { opacity: tagline, transform: [{ translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }
        ]}
      >
        Your personal image memory workspace
      </Animated.Text>
    </View>
  );
}
