import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme, View, Text, StyleSheet } from 'react-native';

import { loadProgress, extractBundledLevels, scanInstalledLevels, ExtractProgress } from './src/store/appStore';
import { useSettingsStore } from './src/store/settingsStore';
import { useTheme, solarizedDark, solarizedLight } from './src/theme';

import { TopicListScreen } from './src/screens/TopicListScreen';
import { LevelListScreen } from './src/screens/LevelListScreen';
import { PlayScreen } from './src/screens/PlayScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

export type RootStackParamList = {
  TopicList: undefined;
  LevelList: { topicId: string };
  Play: { levelId: string; levelTitle: string; topicId: string };
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

type LoadStatus = {
  message: string;
  progress: number;
  zipId?: string;
  zipProgress?: number;
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<LoadStatus>({ message: 'Iniciando…', progress: 0 });
  const { loadSettings } = useSettingsStore();

  useEffect(() => {
    (async () => {
      try {
        setStatus({ message: 'Cargando progreso…', progress: 0.1 });
        await loadProgress();
        setStatus({ message: 'Cargando ajustes…', progress: 0.2 });
        await loadSettings();
        setStatus({ message: 'Preparando niveles…', progress: 0.3 });
        await extractBundledLevels((p: ExtractProgress) => {
          const frac = 0.3 + 0.6 * (p.current / p.total);
          const zipProgress =
            p.zipCurrent != null && p.zipTotal != null && p.zipTotal > 0
              ? p.zipCurrent / p.zipTotal
              : undefined;
          setStatus({ message: `Extrayendo ${p.levelId}…`, progress: frac, zipId: p.levelId, zipProgress });
        });
        setStatus({ message: 'Escaneando niveles…', progress: 0.95 });
        await scanInstalledLevels();
        setReady(true);
      } catch (e) {
        console.error('[App] Boot failed:', e);
        setReady(true);
      }
    })();
  }, []);

  const zipPct = status.zipProgress != null ? Math.round(status.zipProgress * 100) : 0;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {!ready ? (
          <View style={bootStyles.container}>
            <Text style={bootStyles.appName}>LinguaTrainer</Text>
            <View style={bootStyles.barTrack}>
              <View style={[bootStyles.barFill, { width: `${Math.round(status.progress * 100)}%` }]} />
            </View>
            <Text style={bootStyles.message}>{status.message}</Text>
            {status.zipId != null && (
              <View style={bootStyles.zipBlock}>
                <View style={bootStyles.zipHeader}>
                  <Text style={bootStyles.zipLabel}>{status.zipId}</Text>
                  <Text style={bootStyles.zipPct}>{zipPct}%</Text>
                </View>
                <View style={bootStyles.zipTrack}>
                  <View style={[bootStyles.zipFill, { width: `${zipPct}%` }]} />
                </View>
              </View>
            )}
          </View>
        ) : (
          <AppNavigator />
        )}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const bootStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#002b36',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  appName: {
    color: '#268bd2',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 8,
  },
  barTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#073642',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#268bd2',
    borderRadius: 3,
  },
  message: {
    color: '#657b83',
    fontSize: 13,
  },
  zipBlock: {
    width: '100%',
    gap: 6,
    marginTop: 4,
  },
  zipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  zipLabel: {
    color: '#93a1a1',
    fontSize: 11,
    fontFamily: 'monospace',
    flexShrink: 1,
  },
  zipPct: {
    color: '#586e75',
    fontSize: 11,
    marginLeft: 8,
  },
  zipTrack: {
    width: '100%',
    height: 4,
    backgroundColor: '#073642',
    borderRadius: 2,
    overflow: 'hidden',
  },
  zipFill: {
    height: '100%',
    backgroundColor: '#2aa198',
    borderRadius: 2,
  },
});
