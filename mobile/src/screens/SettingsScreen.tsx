import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useSettingsStore } from '../store/settingsStore';
import { downloadAndInstallLevel, DownloadProgress } from '../utils/downloadLevel';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type ThemeMode = 'system' | 'light' | 'dark';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
const THEME_OPTIONS: { value: ThemeMode; label: string; icon: IoniconsName }[] = [
  { value: 'system', label: 'Sistema', icon: 'phone-portrait-outline' },
  { value: 'light',  label: 'Claro',   icon: 'sunny-outline' },
  { value: 'dark',   label: 'Oscuro',  icon: 'moon-outline' },
];

export function SettingsScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const { themeMode, setThemeMode } = useSettingsStore();

  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  const gradientColors = theme.name === 'dark'
    ? [theme.bg, theme.bgAlt] as const
    : [theme.bgAlt, theme.bg] as const;

  async function handleDownload() {
    if (!downloadUrl.trim()) {
      Alert.alert('URL vacía', 'Introduce una URL válida');
      return;
    }
    setDownloadProgress({ stage: 'downloading', progress: 0 });
    await downloadAndInstallLevel(downloadUrl.trim(), setDownloadProgress);
    if (downloadProgress?.stage !== 'error') {
      setDownloadUrl('');
      Alert.alert('¡Listo!', 'El nivel se ha instalado correctamente.');
    }
  }

  const progressLabel: Record<string, string> = {
    downloading: 'Descargando...',
    extracting: 'Extrayendo...',
    importing: 'Importando frases...',
    done: 'Completado',
    error: 'Error',
  };

  return (
    <LinearGradient colors={gradientColors} style={styles.container}>
      <StatusBar barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={theme.textSub} />
            </TouchableOpacity>
            <Text style={styles.title}>Ajustes</Text>
          </View>

          {/* Theme section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tema visual</Text>
            <View style={styles.themeOptions}>
              {THEME_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.themeOption,
                    themeMode === opt.value && styles.themeOptionActive,
                  ]}
                  onPress={() => setThemeMode(opt.value)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={opt.icon} size={22} color={themeMode === opt.value ? theme.primary : theme.textSub} />
                  <Text style={[
                    styles.themeOptionLabel,
                    themeMode === opt.value && styles.themeOptionLabelActive,
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Download section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Añadir nivel</Text>
            <Text style={styles.sectionDesc}>
              Pega la URL de un archivo de nivel (.json) para descargarlo e instalarlo.
            </Text>

            <TextInput
              style={styles.input}
              value={downloadUrl}
              onChangeText={setDownloadUrl}
              placeholder="https://ejemplo.com/nivel.json"
              placeholderTextColor={theme.inactive}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            {downloadProgress && downloadProgress.stage !== 'done' && (
              <View style={styles.progressRow}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={styles.progressText}>
                  {progressLabel[downloadProgress.stage] ?? downloadProgress.stage}
                  {downloadProgress.progress != null && downloadProgress.stage === 'downloading'
                    ? ` ${Math.round(downloadProgress.progress * 100)}%`
                    : ''}
                </Text>
              </View>
            )}

            {downloadProgress?.stage === 'error' && (
              <Text style={styles.errorText}>❌ {downloadProgress.error}</Text>
            )}

            <TouchableOpacity
              style={[styles.downloadBtn, !downloadUrl && styles.downloadBtnDisabled]}
              onPress={handleDownload}
              disabled={!downloadUrl || downloadProgress?.stage === 'downloading'}
              activeOpacity={0.8}
            >
              <Text style={styles.downloadBtnText}>Descargar e instalar</Text>
            </TouchableOpacity>
          </View>

          {/* Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Formato del archivo</Text>
            <Text style={styles.code}>{JSON.stringify({
              metadata: { id: "trav-adv-2", topicId: "travel", title: "Situaciones imprevistas 2", difficulty: 3, dateAdded: "2024-01-01" },
              phrases: [{ spanish: "Hola", english: "Hello" }],
              audio: { "001": "<base64 mp3>" }
            }, null, 2)}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: 20, paddingBottom: 60, gap: 24 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    backBtn: { padding: 8 },
    title: { fontSize: 30, fontWeight: '800', color: theme.textBold },
    section: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.cardBorder,
      gap: 12,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.textBold,
    },
    sectionDesc: {
      fontSize: 14,
      color: theme.textSub,
      lineHeight: 20,
    },
    themeOptions: {
      flexDirection: 'row',
      gap: 10,
    },
    themeOption: {
      flex: 1,
      alignItems: 'center',
      padding: 12,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.bgAlt,
      gap: 4,
    },
    themeOptionActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '18',
    },
    themeOptionLabel: { fontSize: 12, color: theme.textSub, fontWeight: '600' },
    themeOptionLabelActive: { color: theme.primary },
    input: {
      backgroundColor: theme.bgAlt,
      borderRadius: 12,
      padding: 14,
      fontSize: 14,
      color: theme.textBold,
      borderWidth: 1,
      borderColor: theme.border,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    progressText: { fontSize: 14, color: theme.textSub },
    errorText: { fontSize: 14, color: theme.red },
    downloadBtn: {
      backgroundColor: theme.primary,
      borderRadius: 50,
      padding: 14,
      alignItems: 'center',
    },
    downloadBtnDisabled: {
      opacity: 0.4,
    },
    downloadBtnText: {
      color: theme.onPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
    code: {
      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      fontSize: 11,
      color: theme.cyan,
      backgroundColor: theme.bgAlt,
      borderRadius: 8,
      padding: 10,
    },
  });
}
