import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React, { useEffect, useState } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";

import { useTheme } from "../../shared/theme/ThemeContext";
import type { RootTabParamList } from "./types";

const tabIcons: Record<keyof RootTabParamList, React.ComponentProps<typeof Ionicons>["name"]> = {
  Home: "home",
  Chat: "sparkles",
  Collections: "folder-open",
  Stats: "stats-chart"
};

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, styles } = useTheme();
  const insets = useSafeAreaInsets();
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (isKeyboardVisible) return null;

  return (
    <View style={[styles.bottomNav, { bottom: Math.max(insets.bottom, 12) }]}>
      {state.routes.map((route, index) => {
        const isActive = state.index === index;
        const label = descriptors[route.key].options.title ?? route.name;

        return (
          <Pressable
            accessibilityRole="button"
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={[styles.navItem, isActive && styles.activeNavItem]}
          >
            <Ionicons name={tabIcons[route.name as keyof RootTabParamList]} size={20} color={isActive ? colors.onPrimary : colors.muted} />
            <Text style={[styles.navLabel, isActive && styles.activeNavLabel]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
