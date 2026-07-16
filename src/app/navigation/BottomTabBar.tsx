import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";

import { colors } from "../../shared/theme/colors";
import { styles } from "../../shared/theme/styles";
import type { RootTabParamList } from "./types";

const tabIcons: Record<keyof RootTabParamList, React.ComponentProps<typeof Ionicons>["name"]> = {
  Home: "home",
  Chat: "sparkles",
  Collections: "folder-open",
  Stats: "stats-chart"
};

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.bottomNav}>
      {state.routes.map((route, index) => {
        const isActive = state.index === index;
        const label = descriptors[route.key].options.title ?? route.name;

        return (
          <Pressable
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
