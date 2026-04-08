import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { getLevelsByTopic, LevelWithProgress, Topic } from '../db/queries';
import { getTopicsFromStore } from '../store/appStore';
import { useSettingsStore } from '../store/settingsStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'LevelList'>;

const DIFFICULTY_LABELS: Record<number, string> = { 1: 'Básico', 2: 'Intermedio', 3: 'Avanzado' };
const DIFFICULTY_STARS: Record<number, string> = { 1: '★', 2: '★★', 3: '★★★' };
const DIFFICULTY_COLORS: Record<number, string> = { 1: '#859900', 2: '#b58900', 3: '#cb4b16' };
const DIFFICULTY_OPTIONS: { value: 0 | 1 | 2 | 3; label: string; stars: string }[] = [
  { value: 0, label: 'Todos', stars: '·' },
  { value: 1, label: 'Básico', stars: '★' },
  { value: 2, label: 'Intermedio', stars: '★★' },
  { value: 3, label: 'Avanzado', stars: '★★★' },
];

const NEW_LEVEL_DAYS = 30;

function isNewLevel(dateAdded: string): boolean {
  const added = new Date(dateAdded).getTime();
  const now = Date.now();
  return now - added < NEW_LEVEL_DAYS * 24 * 60 * 60 * 1000;
}

export function LevelListScreen({ route, navigation }: Props) {
  const { topicId } = route.params;
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { difficultyFilter, setDifficultyFilter, seenLevelIds } = useSettingsStore();
  const insets = useSafeAreaInsets();
  const [allLevels, setAllLevels] = useState<LevelWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const topicData: Topic | undefined = getTopicsFromStore().find(t => t.id === topicId);

  const loadLevels = useCallback(async () => {
    setLoading(true);
    const data = await getLevelsByTopic(topicId, 0);
    setAllLevels(data);
    setLoading(false);
  }, [topicId]);

  useFocusEffect(useCallback(() => { loadLevels(); }, [loadLevels]));

  const levels = difficultyFilter === 0
    ? allLevels
    : allLevels.filter(l => l.difficulty === difficultyFilter);

  const countByDifficulty: Record<0 | 1 | 2 | 3, number> = {
    0: allLevels.length,
    1: allLevels.filter(l => l.difficulty === 1).length,
    2: allLevels.filter(l => l.difficulty === 2).length,
    3: allLevels.filter(l => l.difficulty === 3).length,
  };

  function renderLevel({ item }: { item: LevelWithProgress }) {
    const progress = item.total_phrases > 0
      ? item.learned_count / item.total_phrases
      : 0;
    const isComplete = item.learned_count >= item.total_phrases && item.total_phrases > 0;
    const diffColor = DIFFICULTY_COLORS[item.difficulty] ?? '#268bd2';
    const isNew = isNewLevel(item.date_added) && !seenLevelIds.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.levelCard, isComplete && styles.levelCardComplete]}
        onPress={() => navigation.navigate('Play', { levelId: item.id, levelTitle: item.title })}
        activeOpacity={0.8}
      >
        <View style={styles.levelHeader}>
          <View style={[styles.diffBadge, { backgroundColor: diffColor + '22', borderColor: diffColor }]}>
            <Text style={[styles.diffStars, { color: diffColor }]}>
              {DIFFICULTY_STARS[item.difficulty]}
            </Text>
            <Text style={[styles.diffLabel, { color: diffColor }]}>
              {DIFFICULTY_LABELS[item.difficulty]}
            </Text>
          </View>

          <View style={styles.badgeRow}>
            {isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>¡Nuevo!</Text>
              </View>
            )}
            {isComplete && (
              <View style={styles.completeBadge}>
                <Text style={styles.completeBadgeText}>✓ Completado</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[styles.levelTitle, isComplete && styles.levelTitleComplete]}>
          {item.title}
        </Text>

        <View style={styles.progressRow}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: topicData?.color ?? theme.primary }]} />
          </View>
          <Text style={styles.progressText}>
            {item.learned_count}/{item.total_phrases}
          </Text>
        </View>

        {item.completed_sessions > 0 && (
          <Text style={styles.sessionsText}>
            {item.completed_sessions} {item.completed_sessions === 1 ? 'sesión' : 'sesiones'} completadas
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  const gradientColors = theme.name === 'dark'
    ? [theme.bg, theme.bgAlt] as const
    : [theme.bgAlt, theme.bg] as const;

  return (
    <LinearGradient colors={gradientColors} style={styles.container}>
      <StatusBar barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        {topicData && <Text style={styles.themeIcon}>{topicData.icon}</Text>}
        <Text style={styles.themeTitle}>{topicData?.name ?? ''}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {DIFFICULTY_OPTIONS.map((opt) => {
          const isActive = difficultyFilter === opt.value;
          const accentColor = topicData?.color ?? theme.primary;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.filterPill,
                isActive && { borderColor: accentColor, backgroundColor: accentColor + '22' },
              ]}
              onPress={() => setDifficultyFilter(opt.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterPillText, isActive && { color: accentColor }]}>
                {opt.stars || '·'}
              </Text>
              <Text style={[styles.filterPillCount, isActive && { color: accentColor }]}>
                {countByDifficulty[opt.value]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={levels}
        keyExtractor={(item) => item.id}
        renderItem={renderLevel}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadLevels} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>
              {difficultyFilter > 0
                ? `No hay niveles de dificultad ${DIFFICULTY_LABELS[difficultyFilter].toLowerCase()} en este tema.`
                : 'No hay niveles disponibles.'}
            </Text>
          ) : null
        }
      />
    </LinearGradient>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 10,
    },
    backBtn: { padding: 8 },
    backText: { fontSize: 22, color: theme.textSub },
    themeIcon: { fontSize: 28 },
    themeTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: theme.textBold,
      flex: 1,
    },
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    filterPill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: theme.bgPanel,
      backgroundColor: theme.bgPanel,
    },
    filterPillText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.textSub,
    },
    filterPillCount: {
      fontSize: 11,
      fontWeight: '600',
      color: theme.inactive,
    },
    settingsBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      backgroundColor: theme.bgPanel,
      borderWidth: 1,
      borderColor: theme.border,
    },
    settingsIcon: { fontSize: 18 },
    list: {
      padding: 16,
      gap: 12,
    },
    levelCard: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.cardBorder,
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: theme.name === 'dark' ? 0.3 : 0.06,
      shadowRadius: 10,
      elevation: 5,
    },
    levelCardComplete: {
      borderColor: theme.success + '60',
    },
    levelHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    diffBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    diffStars: { fontSize: 11 },
    diffLabel: { fontSize: 12, fontWeight: '600' },
    badgeRow: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },
    newBadge: {
      backgroundColor: theme.primary + '22',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    newBadgeText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    completeBadge: {
      backgroundColor: theme.success + '22',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    completeBadgeText: {
      color: theme.success,
      fontSize: 12,
      fontWeight: '600',
    },
    levelTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.textBold,
    },
    levelTitleComplete: {
      textDecorationLine: 'line-through',
      color: theme.textSub,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    progressBarBg: {
      flex: 1,
      height: 6,
      backgroundColor: theme.bgPanel,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    progressText: {
      fontSize: 13,
      color: theme.textSub,
      minWidth: 36,
      textAlign: 'right',
    },
    sessionsText: {
      fontSize: 12,
      color: theme.inactive,
    },
    emptyText: {
      textAlign: 'center',
      color: theme.textSub,
      marginTop: 40,
      fontSize: 15,
    },
  });
}
