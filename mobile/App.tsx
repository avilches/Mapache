import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme, View, ActivityIndicator } from 'react-native';

import { loadProgress, extractBundledLevels, scanInstalledLevels } from './src/store/appStore';
import { useSettingsStore } from './src/store/settingsStore';
import { useTheme, solarizedDark, solarizedLight } from './src/theme';

import { TopicListScreen } from './src/screens/TopicListScreen';
import { LevelListScreen } from './src/screens/LevelListScreen';
import { PlayScreen } from './src/screens/PlayScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

export type RootStackParamList = {
  TopicList: undefined;
  LevelList: { topicId: string };
  Play: { levelId: string; levelTitle: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { themeMode } = useSettingsStore();
  const systemScheme = useColorScheme();
  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemScheme === 'dark');

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: solarizedDark.bg, card: solarizedDark.bgAlt, border: solarizedDark.border, primary: solarizedDark.primary, text: solarizedDark.textBold, notification: solarizedDark.orange } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: solarizedLight.bg, card: solarizedLight.bgAlt, border: solarizedLight.border, primary: solarizedLight.primary, text: solarizedLight.textBold, notification: solarizedLight.orange } };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="TopicList" component={TopicListScreen} />
        <Stack.Screen name="LevelList" component={LevelListScreen} />
        <Stack.Screen name="Play" component={PlayScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
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
