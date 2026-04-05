import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { loadProgress, extractBundledLevels, scanInstalledLevels } from './src/store/appStore';
import { useSettingsStore } from './src/store/settingsStore';
import { useTheme, solarizedDark, solarizedLight } from './src/theme';

import { TopicListScreen } from './src/screens/TopicListScreen';
import { LevelListScreen } from './src/screens/LevelListScreen';
import { PlayScreen } from './src/screens/PlayScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

export type PracticeStackParamList = {
  TopicList: undefined;
  LevelList: { topicId: string };
  Play: { levelId: string; levelTitle: string };
};

export type RootTabParamList = {
  Practice: NavigatorScreenParams<PracticeStackParamList> | undefined;
  Settings: undefined;
};

const PracticeStack = createNativeStackNavigator<PracticeStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

function PracticeNavigator() {
  return (
    <PracticeStack.Navigator screenOptions={{ headerShown: false }}>
      <PracticeStack.Screen name="TopicList" component={TopicListScreen} />
      <PracticeStack.Screen name="LevelList" component={LevelListScreen} />
      <PracticeStack.Screen name="Play" component={PlayScreen} />
    </PracticeStack.Navigator>
  );
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Ocultar barra durante la sesión de práctica
  const practiceRoute = state.routes.find(r => r.name === 'Practice');
  const practiceNavState = practiceRoute?.state as any;
  const currentPracticeScreen = practiceNavState?.routes?.[practiceNavState?.index ?? 0]?.name;
  if (currentPracticeScreen === 'Play') return null;

  const isSettings = state.routes[state.index].name === 'Settings';

  return (
    <View style={[
      styles.bar,
      {
        paddingBottom: Math.max(insets.bottom, 8),
        backgroundColor: theme.bgAlt + 'ee',
        borderTopColor: theme.border,
      },
    ]}>
      <View style={styles.spacer} />

      <TouchableOpacity
        style={[
          styles.practiceBtn,
          { shadowColor: theme.primary },
        ]}
        onPress={() => navigation.navigate('Practice')}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={[theme.primary, theme.cyan] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.practiceBtnGradient}
        >
          <Text style={styles.practiceBtnText}>Practice</Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.settingsBtn,
          {
            backgroundColor: isSettings ? theme.primary + '22' : theme.bgPanel,
            borderColor: isSettings ? theme.primary : theme.border,
          },
        ]}
        onPress={() => navigation.navigate('Settings')}
        activeOpacity={0.8}
      >
        <Text style={styles.settingsIcon}>⚙️</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  spacer: { width: 52 },
  practiceBtn: {
    flex: 1,
    borderRadius: 50,
    overflow: 'hidden',
    marginHorizontal: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  practiceBtnGradient: {
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: 'center',
  },
  practiceBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  settingsBtn: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    borderWidth: 1,
  },
  settingsIcon: { fontSize: 22 },
});

function AppNavigator() {
  const { themeMode } = useSettingsStore();
  const systemScheme = useColorScheme();
  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemScheme === 'dark');

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: solarizedDark.bg, card: solarizedDark.bgAlt, border: solarizedDark.border, primary: solarizedDark.primary, text: solarizedDark.textBold, notification: solarizedDark.orange } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: solarizedLight.bg, card: solarizedLight.bgAlt, border: solarizedLight.border, primary: solarizedLight.primary, text: solarizedLight.textBold, notification: solarizedLight.orange } };

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Practice" component={PracticeNavigator} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    (async () => {
      await loadProgress();
      await loadSettings();
      await extractBundledLevels();
      await scanInstalledLevels();
      setReady(true);
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {!ready ? (
          <View style={{ flex: 1, backgroundColor: '#002b36', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#268bd2" />
          </View>
        ) : (
          <AppNavigator />
        )}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
