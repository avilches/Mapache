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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { getLevelsByTopic, LevelWithProgress, Topic, CEFRLevel } from '../db/queries';
import { getTopicsFromStore } from '../store/appStore';
import { useSettingsStore } from '../store/settingsStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'LevelList'>;

const DIFFICULTY_LABELS: Record<CEFRLevel, string> = {
  'A1': 'Principiante',
  'A2': 'Elemental',
  'B1': 'Intermedio',
  'B2': 'Intermedio alto',
  'C1': 'Avanzado',
  'C2': 'Maestría',
};
function difficultyColor(difficulty: CEFRLevel, theme: ReturnType<typeof useTheme>): string {
  if (difficulty === 'A1') return theme.green;
  if (difficulty === 'A2') return theme.blue;
  if (difficulty === 'B1') return theme.yellow;
  if (difficulty === 'B2') return theme.orange;
  if (difficulty === 'C1') return theme.red;
  if (difficulty === 'C2') return theme.magenta;
  return theme.primary;
}
const DIFFICULTY_VALUES: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

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
    const data = await getLevelsByTopic(topicId, '');
    setAllLevels(data);
    setLoading(false);
  }, [topicId]);

  useFocusEffect(useCallback(() => { loadLevels(); }, [loadLevels]));

  const levels = difficultyFilter === ''
    ? allLevels
    : allLevels.filter(l => l.difficulty === difficultyFilter);

  const countByDifficulty: Record<CEFRLevel, number> = {
    'A1': allLevels.filter(l => l.difficulty === 'A1').length,
    'A2': allLevels.filter(l => l.difficulty === 'A2').length,
    'B1': allLevels.filter(l => l.difficulty === 'B1').length,
    'B2': allLevels.filter(l => l.difficulty === 'B2').length,
    'C1': allLevels.filter(l => l.difficulty === 'C1').length,
    'C2': allLevels.filter(l => l.difficulty === 'C2').length,
  };

  // Solo se muestran pills para dificultades con al menos 1 level en este topic.
  const availableDifficulties = DIFFICULTY_VALUES.filter(d => countByDifficulty[d] > 0);

  // Si el filtro actual apunta a una dificultad sin levels, lo limpiamos.
  useEffect(() => {
    if (loading) return;
    if (difficultyFilter !== '' && countByDifficulty[difficultyFilter] === 0) {
      setDifficultyFilter('');
    }
  }, [loading, difficultyFilter, allLevels]); // eslint-disable-line react-hooks/exhaustive-deps

  function renderLevel({ item }: { item: LevelWithProgress }) {
    const progress = item.total_phrases > 0
      ? item.mastered_count / item.total_phrases
      : 0;
    const isComplete = item.mastered_count >= item.total_phrases && item.total_phrases > 0;
    const diffColor = difficultyColor(item.difficulty, theme);
    const isNew = isNewLevel(item.date_added) && !seenLevelIds.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.levelCard, isComplete && styles.levelCardComplete]}
        onPress={() => navigation.navigate('Play', { levelId: item.id, levelTitle: item.title, topicId })}
        activeOpacity={0.8}
      >
        <View style={styles.levelHeader}>
          <View style={[styles.diffBadge, { backgroundColor: diffColor + '22', borderColor: diffColor }]}>
            <Text style={[styles.diffCode, { color: diffColor }]}>
              {item.difficulty}
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
            {item.mastered_count}/{item.total_phrases}
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
          <Ionicons name="arrow-back" size={22} color={theme.textSub} />
        </TouchableOpacity>
        {topicData && <Ionicons name={topicData.icon as any} size={28} color={topicData.color} />}
        <Text style={styles.themeTitle}>{topicData?.name ?? ''}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={18} color={theme.textSub} />
        </TouchableOpacity>
      </View>

      {availableDifficulties.length > 1 && (
        <View style={styles.filterRow}>
          {availableDifficulties.map((value) => {
            const isActive = difficultyFilter === value;
            const diffColor = difficultyColor(value, theme);
            return (
              <TouchableOpacity
                key={value}
                style={[
                  styles.filterPill,
                  isActive && { borderColor: diffColor, backgroundColor: diffColor + '22' },
                ]}
                // Toggle: al pulsar el filtro activo lo deseleccionamos (= todos).
                onPress={() => setDifficultyFilter(isActive ? '' : value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterPillText, isActive && { color: diffColor }]}>
                  {value}
                </Text>
                <Text style={[styles.filterPillCount, isActive && { color: diffColor }]}>
                  {countByDifficulty[value]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

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
              {difficultyFilter !== ''
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
    diffCode: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
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
