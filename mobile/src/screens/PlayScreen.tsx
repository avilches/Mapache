import React, { useEffect, useState, useCallback, useRef, useReducer } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  AppState,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { PhraseCard, PhraseCardHandle } from '../components/PhraseCard';
import { useAudio } from '../hooks/useAudio';
import {
  getLevelStats,
  getNextLevelId,
  LevelStats,
  PhraseRating,
} from '../db/queries';
import { createSession, SessionController } from '../db/session';
import {
  getLevelsFromStore,
  getPhraseProgressFromStore,
} from '../store/appStore';
import { useSettingsStore } from '../store/settingsStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Play'>;
type ListenState = 'idle' | 'playing' | 'played' | 'revealed';

export function PlayScreen({ route, navigation }: Props) {
  const { levelId, levelTitle, topicId } = route.params;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(theme);
  const { playAudio, stopAudio } = useAudio();
  const markLevelSeen = useSettingsStore(s => s.markLevelSeen);
  const difficultyFilter = useSettingsStore(s => s.difficultyFilter);

  // Controller de sesión (cola + cursor + reinsertCount + timer + listens)
  const sessionRef = useRef<SessionController | null>(null);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const [listenState, setListenState] = useState<ListenState>('idle');
  const [enterFrom, setEnterFrom] = useState<'right' | 'left'>('right');
  const [finished, setFinished] = useState(false);
  const [finishedStats, setFinishedStats] = useState<LevelStats | null>(null);

  const cardRef = useRef<PhraseCardHandle>(null);

  const startSession = useCallback(() => {
    sessionRef.current = createSession(levelId);
    setListenState('idle');
    setEnterFrom('right');
    setFinished(false);
    setFinishedStats(null);
    forceUpdate();
  }, [levelId]);

  useFocusEffect(useCallback(() => {
    startSession();
    markLevelSeen(levelId);
    return () => { stopAudio(); };
  }, [levelId, startSession]));

  // Pausar timer cuando la app va a background
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        sessionRef.current?.pause();
      } else if (state === 'active') {
        sessionRef.current?.resume();
      }
    });
    return () => sub.remove();
  }, []);

  // Keyboard support (web/simulator Mac): ↑ easy, ↓ hard, ← ok, → atrás
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') cardRef.current?.triggerEasy();
      else if (e.key === 'ArrowDown') cardRef.current?.triggerHard();
      else if (e.key === 'ArrowLeft') cardRef.current?.triggerOk();
      else if (e.key === 'ArrowRight') cardRef.current?.triggerPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const session = sessionRef.current;
  const currentPhrase = session?.current();
  const cursor = session?.position() ?? 0;
  const queueLength = session?.size() ?? 0;

  async function handleRate(rating: PhraseRating) {
    const s = sessionRef.current;
    if (!s || s.isFinished()) return;
    await stopAudio();
    await s.rate(rating);
    if (s.isFinished()) {
      const stats = await s.finish();
      setFinishedStats(stats);
      setFinished(true);
    } else {
      setEnterFrom('right');
      setListenState('idle');
      forceUpdate();
    }
  }

  async function handleEasy() { await handleRate('easy'); }
  async function handleOk() { await handleRate('ok'); }
  async function handleHard() { await handleRate('hard'); }

  async function handlePrev() {
    const s = sessionRef.current;
    if (!s || s.position() === 0) return;
    await stopAudio();
    s.back();
    setEnterFrom('left');
    setListenState('idle');
    forceUpdate();
  }

  async function handleListen() {
    const s = sessionRef.current;
    const phrase = s?.current();
    if (!s || !phrase) return;
    if (listenState === 'playing') return;
    if (listenState === 'idle') {
      setListenState('played');
    }
    s.listen();
    await playAudio(phrase.audio_path);
  }

  function handleReveal() {
    setListenState('revealed');
  }

  function handleExit() {
    stopAudio();
    navigation.goBack();
  }

  const gradientColors = theme.name === 'dark'
    ? [theme.bg, '#0a3040'] as const
    : [theme.bgAlt, theme.bg] as const;

  function resetUiAfterRebuild() {
    setListenState('idle');
    setEnterFrom('right');
    setFinished(false);
    setFinishedStats(null);
    forceUpdate();
  }

  function handleRepeat() {
    sessionRef.current?.repeat();
    resetUiAfterRebuild();
  }

  async function handleReset() {
    await sessionRef.current?.resetAndRepeat();
    resetUiAfterRebuild();
  }

  if (finished && finishedStats) {
    return <FinishedView
      levelId={levelId}
      topicId={topicId}
      difficultyFilter={difficultyFilter}
      stats={finishedStats}
      navigation={navigation}
      onRepeat={handleRepeat}
      onReset={handleReset}
      theme={theme}
    />;
  }

  if (!currentPhrase) {
    return (
      <LinearGradient colors={gradientColors} style={styles.container}>
        <Text style={styles.emptyText}>Cargando...</Text>
      </LinearGradient>
    );
  }

  const prog = getPhraseProgressFromStore()[currentPhrase.id];
  const seenCount = prog?.seenCount ?? 0;
  const lastRating = prog?.lastRating ?? null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LinearGradient colors={gradientColors} style={styles.container}>
        <StatusBar barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={handleExit} style={styles.exitBtn}>
            <Text style={styles.exitText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{levelTitle}</Text>
          <Text style={styles.counter}>{cursor + 1}/{queueLength}</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, {
            width: `${(cursor / Math.max(queueLength, 1)) * 100}%`
          }]} />
        </View>

        {/* Card */}
        <View style={styles.cardContainer}>
          <PhraseCard
            ref={cardRef}
            key={`${currentPhrase.id}-${cursor}-${queueLength}`}
            phrase={currentPhrase}
            listenState={listenState}
            onSwipeUp={handleEasy}
            onSwipeLeft={handleOk}
            onSwipeDown={handleHard}
            onSwipeRight={handlePrev}
            onListenPress={handleListen}
            onRevealPress={handleReveal}
            enterFrom={enterFrom}
            canGoPrev={cursor > 0}
            seenCount={seenCount}
            lastRating={lastRating}
          />
        </View>
      </LinearGradient>
    </GestureHandlerRootView>
  );
}

// ─── Finished view ───────────────────────────────────────────────────────────

interface FinishedProps {
  levelId: string;
  topicId: string;
  difficultyFilter: 0 | 1 | 2 | 3;
  stats: LevelStats;
  navigation: any;
  onRepeat: () => void;
  onReset: () => void;
  theme: ReturnType<typeof useTheme>;
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function FinishedView({ stats, navigation, onRepeat, onReset, theme, levelId, topicId, difficultyFilter }: FinishedProps) {
  const styles = makeFinishedStyles(theme);
  const [nextLevelId, setNextLevelId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const next = await getNextLevelId(levelId, topicId, difficultyFilter);
      setNextLevelId(next);
    })();
  }, [levelId, topicId, difficultyFilter]);

  const nextLevelTitle = nextLevelId
    ? getLevelsFromStore().find(l => l.id === nextLevelId)?.title ?? ''
    : '';

  function handleNextLevel() {
    if (!nextLevelId) return;
    navigation.replace('Play', { levelId: nextLevelId, levelTitle: nextLevelTitle, topicId });
  }

  const gradientColors = theme.name === 'dark'
    ? [theme.bg, '#0a3040'] as const
    : [theme.bgAlt, theme.bg] as const;

  return (
    <LinearGradient colors={gradientColors} style={styles.container}>
      <Ionicons name="trophy" size={72} color={theme.primary} />
      <Text style={styles.title}>¡Sesión completada!</Text>

      <View style={styles.statsBox}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Dominadas</Text>
          <Text style={[styles.statValue, { color: theme.success }]}>
            {stats.masteredCount}/{stats.totalPhrases}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Tiempo en esta lección</Text>
          <Text style={styles.statValue}>{formatTime(stats.totalTimeSeconds)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Escuchas</Text>
          <Text style={styles.statValue}>{stats.totalListens}</Text>
        </View>
      </View>

      <View style={styles.btns}>
        {nextLevelId ? (
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={handleNextLevel}>
            <Text style={styles.btnText}>Siguiente nivel →</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.lastLevelText}>Último nivel del tema</Text>
        )}
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.bgPanel }]} onPress={onRepeat}>
          <Text style={[styles.btnText, { color: theme.textSub }]}>Repetir nivel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.bgPanel }]} onPress={onReset}>
          <Text style={[styles.btnText, { color: theme.textSub }]}>Empezar de cero</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.bgPanel }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.btnText, { color: theme.textSub }]}>Volver al menú</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    exitBtn: { padding: 8 },
    exitText: { fontSize: 18, color: theme.textSub },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textBold },
    counter: { fontSize: 15, color: theme.textSub, minWidth: 40, textAlign: 'right' },
    progressBg: {
      height: 4,
      backgroundColor: theme.bgPanel,
      marginHorizontal: 20,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.primary,
      borderRadius: 2,
    },
    cardContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      color: theme.textSub,
      textAlign: 'center',
      marginTop: 100,
    },
  });
}

function makeFinishedStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 24,
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: theme.textBold,
      textAlign: 'center',
    },
    statsBox: {
      width: '100%',
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.cardBorder,
      gap: 12,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    statLabel: { fontSize: 16, color: theme.text },
    statValue: { fontSize: 22, fontWeight: '700', color: theme.primary },
    divider: { height: 1, backgroundColor: theme.border },
    btns: { width: '100%', gap: 12 },
    btn: {
      paddingVertical: 16,
      borderRadius: 50,
      alignItems: 'center',
    },
    btnText: { fontSize: 16, fontWeight: '600', color: theme.onPrimary },
    lastLevelText: {
      fontSize: 14,
      color: theme.textSub,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  });
}
