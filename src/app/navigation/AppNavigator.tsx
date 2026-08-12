import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationLightTheme,
  NavigationContainer,
  createNavigationContainerRef
} from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, StatusBar, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { ChatLauncherProvider, useChatLauncher } from "../../features/chat/components/ChatLauncher";
import { ChatModal } from "../../features/chat/components/ChatModal";
import { CollectionsScreen } from "../../features/collections/screens/CollectionsScreen";
import { HomeScreen } from "../../features/home/screens/HomeScreen";
import { SearchScreen } from "../../features/search/screens/SearchScreen";
import { SettingsScreen } from "../../features/settings/screens/SettingsScreen";
import { StatsScreen } from "../../features/stats/screens/StatsScreen";
import { Header } from "../../shared/components/Header";
import { useTheme } from "../../shared/theme/ThemeContext";
import { BottomTabBar } from "./BottomTabBar";
import type { RootTabParamList } from "./types";

const Tab = createBottomTabNavigator<RootTabParamList>();
const navigationRef = createNavigationContainerRef<RootTabParamList>();

/** The side menu mirrors the tab bar, so both are driven by one list. */
const MENU_ITEMS: Array<{ screen: keyof RootTabParamList; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = [
  { screen: "Home", label: "Home", icon: "home" },
  { screen: "Search", label: "Search", icon: "search" },
  { screen: "Categories", label: "Categories", icon: "folder-open" },
  { screen: "Stats", label: "Index stats", icon: "stats-chart" },
  { screen: "Settings", label: "Settings", icon: "settings-sharp" }
];

/** Home is the only tab that launches the AI modal, via the ask panel near the top of the screen. */
function HomeRoute() {
  const openChat = useChatLauncher();
  return <HomeScreen onChatPress={openChat} />;
}

function AppNavigationShell() {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isChatOpen, setChatOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors, isDark, styles, toggleTheme } = useTheme();

  // Stable so the context value does not change identity and re-render every tab on menu toggles.
  const openChat = useCallback(() => setChatOpen(true), []);

  const navigateFromMenu = (screen: keyof RootTabParamList) => {
    setMenuOpen(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate(screen);
    }
  };

  const openChatFromMenu = () => {
    setMenuOpen(false);
    setChatOpen(true);
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
        translucent={false}
      />
      <View style={styles.appShell}>
        <Header onMenuPress={() => setMenuOpen(true)} onChatPress={openChat} />
        <View style={styles.content}>
          <ChatLauncherProvider openChat={openChat}>
            <Tab.Navigator
              initialRouteName="Home"
              tabBar={(props) => <BottomTabBar {...props} />}
              screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: colors.background }
              }}
            >
              <Tab.Screen name="Home" component={HomeRoute} options={{ title: "Home" }} />
              <Tab.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
              <Tab.Screen name="Categories" component={CollectionsScreen} options={{ title: "Categories" }} />
              <Tab.Screen name="Stats" component={StatsScreen} options={{ title: "Stats" }} />
              <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
            </Tab.Navigator>
          </ChatLauncherProvider>
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

              <Pressable style={styles.menuFeatureItem} onPress={openChatFromMenu}>
                <MaterialCommunityIcons name="auto-fix" size={20} color={colors.primary} />
                <View style={styles.flexOne}>
                  <Text style={styles.menuItemText}>Ask Recall</Text>
                  <Text style={styles.menuSubtitle}>Find images in plain language</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>

              <View style={styles.menuSection}>
                {MENU_ITEMS.map((item) => (
                  <Pressable key={item.screen} style={styles.menuItem} onPress={() => navigateFromMenu(item.screen)}>
                    <Ionicons name={item.icon} size={20} color={colors.primary} />
                    <Text style={styles.menuItemText}>{item.label}</Text>
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

      <ChatModal onClose={() => setChatOpen(false)} visible={isChatOpen} />
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
