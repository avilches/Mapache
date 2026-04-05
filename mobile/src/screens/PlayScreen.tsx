import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTheme } from '../theme';
import { PhraseCard } from '../components/PhraseCard';
import { useAudio } from '../hooks/useAudio';
import {
  getActivePhrases,
  markPhraseLearnedInDb,
  markPhraseSeenInDb,
  completeLevel,
  Phrase,
} from '../db/queries';
import { useSettingsStore } from '../store/settingsStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PracticeStackParamList } from '../../App';

type Props = NativeStackScreenProps<PracticeStackParamList, 'Play'>;
type ListenState = 'idle' | 'playing' | 'played' | 'revealed';

export function PlayScreen({ route, navigation }: Props) {
  const { levelId, levelTitle } = route.params;
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { playAudio, stopAudio } = useAudio();
  const markLevelSeen = useSettingsStore(s => s.markLevelSeen);

  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [index, setIndex] = useState(0);
  const [listenState, setListenState] = useState<ListenState>('idle');
  const [enterFrom, setEnterFrom] = useState<'right' | 'left'>('right');
  const [sessionLearned, setSessionLearned] = useState(0);
  const [sessionSeen, setSessionSeen] = useState(0);
  const [finished, setFinished] = useState(false);
  const seenInSession = useRef<Set<string>>(new Set());

  useFocusEffect(useCallback(() => {
    loadPhrases();
    markLevelSeen(levelId);
    return () => { stopAudio(); };
  }, [levelId]));

  // Keyboard support for Mac/simulator
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowUp') handleLearn();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, phrases]);

  async function loadPhrases() {
    const data = await getActivePhrases(levelId);
    setPhrases(data);
    setIndex(0);
    setListenState('idle');
    setFinished(false);
  }

  const currentPhrase = phrases[index];

  async function handleNext() {
    if (!currentPhrase) return;
    await stopAudio();

    if (!seenInSession.current.has(currentPhrase.id)) {
      seenInSession.current.add(currentPhrase.id);
      await markPhraseSeenInDb(currentPhrase.id, levelId);
      setSessionSeen(s => s + 1);
    }

    if (index < phrases.length - 1) {
      setEnterFrom('right');
      setListenState('idle');
      setIndex(i => i + 1);
    } else {
      await finishSession();
    }
  }

  async function handlePrev() {
    if (index > 0) {
      await stopAudio();
      setEnterFrom('left');
      setListenState('idle');
      setIndex(i => i - 1);
    }
  }

  async function handleLearn() {
    if (!currentPhrase) return;
    await stopAudio();
    await markPhraseLearnedInDb(currentPhrase.id, levelId);
    setSessionLearned(l => l + 1);

    const newPhrases = phrases.filter((_, i) => i !== index);
    setPhrases(newPhrases);

    if (newPhrases.length === 0) {
      await finishSession();
    } else {
      setEnterFrom('right');
      setListenState('idle');
      setIndex(i => Math.min(i, newPhrases.length - 1));
    }
  }

  async function finishSession() {
    await completeLevel(levelId);
    setFinished(true);
  }

  async function handleListen() {
    if (!currentPhrase) return;
    if (listenState === 'idle' || listenState === 'playing') {
      setListenState('playing');
      await playAudio(currentPhrase.audio_path);
      setListenState('played');
    } else if (listenState === 'played') {
      setListenState('revealed');
      await playAudio(currentPhrase.audio_path);
    } else {
      // revealed → play again
      await playAudio(currentPhrase.audio_path);
    }
  }

  function handleExit() {
    stopAudio();
    navigation.goBack();
  }

  const gradientColors = theme.name === 'dark'
    ? [theme.bg, '#0a3040'] as const
    : [theme.bgAlt, theme.bg] as const;

  if (finished) {
    return <FinishedView
      levelId={levelId}
      sessionSeen={sessionSeen}
      sessionLearned={sessionLearned}
      totalActive={0}
      navigation={navigation}
      onRepeat={loadPhrases}
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LinearGradient colors={gradientColors} style={styles.container}>
        <StatusBar barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleExit} style={styles.exitBtn}>
            <Text style={styles.exitText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{levelTitle}</Text>
          <Text style={styles.counter}>{index + 1}/{phrases.length}</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, {
            width: `${((index) / Math.max(phrases.length, 1)) * 100}%`
          }]} />
        </View>

        {/* Card */}
        <View style={styles.cardContainer}>
          <PhraseCard
            key={currentPhrase.id}
            phrase={currentPhrase}
            listenState={listenState}
            onSwipeLeft={handleNext}
            onSwipeRight={handlePrev}
            onSwipeUp={handleLearn}
            onListenPress={handleListen}
            enterFrom={enterFrom}
          />
        </View>

        {/* Bottom hint */}
        <View style={styles.bottomHint}>
          <Text style={styles.hintText}>Desliza ↑ para marcar como aprendida</Text>
        </View>
      </LinearGradient>
    </GestureHandlerRootView>
  );
}

// ─── Finished view ───────────────────────────────────────────────────────────

interface FinishedProps {
  levelId: string;
  sessionSeen: number;
  sessionLearned: number;
  totalActive: number;
  navigation: any;
  onRepeat: () => void;
  theme: ReturnType<typeof useTheme>;
}

function FinishedView({ sessionSeen, sessionLearned, navigation, onRepeat, theme, levelId }: FinishedProps) {
  const styles = makeFinishedStyles(theme);
  const { resetLevelProgress } = require('../db/queries');

  async function handleReset() {
    await resetLevelProgress(levelId);
    onRepeat();
  }

  const gradientColors = theme.name === 'dark'
    ? [theme.bg, '#0a3040'] as const
    : [theme.bgAlt, theme.bg] as const;

  return (
    <LinearGradient colors={gradientColors} style={styles.container}>
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>¡Sesión completada!</Text>

      <View style={styles.statsBox}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Frases vistas</Text>
          <Text style={styles.statValue}>{sessionSeen}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Marcadas como aprendidas</Text>
          <Text style={[styles.statValue, { color: theme.success }]}>{sessionLearned}</Text>
        </View>
      </View>

      <View style={styles.btns}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={onRepeat}>
          <Text style={styles.btnText}>Repetir nivel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.bgPanel }]} onPress={handleReset}>
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
      paddingTop: 56,
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
    bottomHint: {
      paddingBottom: 40,
      alignItems: 'center',
    },
    hintText: {
      fontSize: 13,
      color: theme.inactive,
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
    emoji: { fontSize: 72 },
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
    btnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  });
}
