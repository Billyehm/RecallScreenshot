import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationLightTheme,
  NavigationContainer,
  createNavigationContainerRef,
  type NavigationProp,
  useNavigation
} from "@react-navigation/native";
import React, { useMemo, useState } from "react";
import { Pressable, StatusBar, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { ChatScreen } from "../../features/chat/screens/ChatScreen";
import { CollectionsScreen } from "../../features/collections/screens/CollectionsScreen";
import { HomeScreen } from "../../features/home/screens/HomeScreen";
import { StatsScreen } from "../../features/stats/screens/StatsScreen";
import { Header } from "../../shared/components/Header";
import { useTheme } from "../../shared/theme/ThemeContext";
import { BottomTabBar } from "./BottomTabBar";
import type { RootTabParamList } from "./types";

const Tab = createBottomTabNavigator<RootTabParamList>();
const navigationRef = createNavigationContainerRef<RootTabParamList>();

function HomeRoute() {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  return <HomeScreen onChatPress={() => navigation.navigate("Chat")} />;
}

function AppNavigationShell() {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors, isDark, styles, toggleTheme } = useTheme();

  const navigateFromMenu = (screen: keyof RootTabParamList) => {
    setMenuOpen(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate(screen);
    }
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
        translucent={false}
      />
      <View style={styles.appShell}>
        <Header onMenuPress={() => setMenuOpen(true)} onChatPress={() => navigationRef.isReady() && navigationRef.navigate("Chat")} />
        <View style={styles.content}>
          <Tab.Navigator
            initialRouteName="Home"
            tabBar={(props) => <BottomTabBar {...props} />}
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: colors.background }
            }}
          >
            <Tab.Screen name="Home" component={HomeRoute} options={{ title: "Home" }} />
            <Tab.Screen name="Chat" component={ChatScreen} options={{ title: "AI" }} />
            <Tab.Screen name="Collections" component={CollectionsScreen} options={{ title: "Collections" }} />
            <Tab.Screen name="Stats" component={StatsScreen} options={{ title: "Stats" }} />
          </Tab.Navigator>
        </View>
        {isMenuOpen ? (
          <View style={styles.menuLayer}>
            <Pressable style={styles.menuScrim} onPress={() => setMenuOpen(false)} />
            <View style={[styles.sideMenu, { paddingTop: Math.max(insets.top, 12) + 18 }]}>
              <View style={styles.menuHeader}>
                <View style={styles.logoMark}>
                  <MaterialCommunityIcons name="memory" size={22} color={colors.primary} />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.menuTitle}>Recall!</Text>
                  <Text style={styles.menuSubtitle}>Digital memory hub</Text>
                </View>
                <Pressable style={styles.menuIconButton} onPress={() => setMenuOpen(false)}>
                  <Ionicons name="close" size={20} color={colors.text} />
                </Pressable>
              </View>

              <View style={styles.menuSection}>
                {(["Home", "Chat", "Collections", "Stats"] as Array<keyof RootTabParamList>).map((screen) => (
                  <Pressable key={screen} style={styles.menuItem} onPress={() => navigateFromMenu(screen)}>
                    <Ionicons
                      name={screen === "Home" ? "home" : screen === "Chat" ? "sparkles" : screen === "Collections" ? "folder-open" : "stats-chart"}
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={styles.menuItemText}>{screen === "Chat" ? "AI" : screen}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.themeToggle} onPress={toggleTheme}>
                <View style={styles.themeToggleTextWrap}>
                  <Text style={styles.menuItemText}>Dark Mode</Text>
                  <Text style={styles.menuSubtitle}>{isDark ? "On" : "Off"}</Text>
                </View>
                <View style={[styles.toggleTrack, isDark && styles.toggleTrackActive]}>
                  <View style={[styles.toggleKnob, isDark && styles.toggleKnobActive]} />
                </View>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

export function AppNavigator() {
  const { colors, isDark } = useTheme();
  const navigationTheme = useMemo(() => {
    const baseTheme = isDark ? NavigationDarkTheme : NavigationLightTheme;

    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.outline,
        notification: colors.tertiary
      }
    };
  }, [colors, isDark]);

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <AppNavigationShell />
    </NavigationContainer>
  );
}
