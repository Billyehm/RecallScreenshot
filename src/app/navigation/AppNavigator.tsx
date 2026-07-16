import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer, createNavigationContainerRef, type NavigationProp, useNavigation } from "@react-navigation/native";
import React from "react";
import { SafeAreaView, StatusBar, View } from "react-native";

import { ChatScreen } from "../../features/chat/screens/ChatScreen";
import { CollectionsScreen } from "../../features/collections/screens/CollectionsScreen";
import { HomeScreen } from "../../features/home/screens/HomeScreen";
import { StatsScreen } from "../../features/stats/screens/StatsScreen";
import { Header } from "../../shared/components/Header";
import { colors } from "../../shared/theme/colors";
import { styles } from "../../shared/theme/styles";
import { BottomTabBar } from "./BottomTabBar";
import type { RootTabParamList } from "./types";

const Tab = createBottomTabNavigator<RootTabParamList>();
const navigationRef = createNavigationContainerRef<RootTabParamList>();

function HomeRoute() {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  return <HomeScreen onChatPress={() => navigation.navigate("Chat")} />;
}

function AppNavigationShell() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.appShell}>
        <Header onChatPress={() => navigationRef.isReady() && navigationRef.navigate("Chat")} />
        <View style={styles.content}>
          <Tab.Navigator initialRouteName="Home" tabBar={(props) => <BottomTabBar {...props} />} screenOptions={{ headerShown: false }}>
            <Tab.Screen name="Home" component={HomeRoute} options={{ title: "Home" }} />
            <Tab.Screen name="Chat" component={ChatScreen} options={{ title: "AI" }} />
            <Tab.Screen name="Collections" component={CollectionsScreen} options={{ title: "Collections" }} />
            <Tab.Screen name="Stats" component={StatsScreen} options={{ title: "Stats" }} />
          </Tab.Navigator>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <AppNavigationShell />
    </NavigationContainer>
  );
}
