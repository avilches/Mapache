import React, { useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { Phrase, PhraseRating } from '../db/queries';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;
const SWIPE_VERTICAL_THRESHOLD = 60;

type ListenState = 'idle' | 'playing' | 'played' | 'revealed';

export interface PhraseCardHandle {
  triggerEasy: () => void;
  triggerOk: () => void;
  triggerHard: () => void;
  triggerPrev: () => void;
}

interface Props {
  phrase: Phrase;
  listenState: ListenState;
  /** Fácil: rating -= 1 */
  onSwipeUp: () => void;
  /** OK: rating sin cambio, avanza */
  onSwipeLeft: () => void;
  /** Difícil: rating += 1, se reinserta en la cola */
  onSwipeDown: () => void;
  /** Atrás: sin cambio de rating */
  onSwipeRight: () => void;
  onListenPress: () => void;
  onRevealPress: () => void;
  enterFrom?: 'right' | 'left';
  canGoPrev?: boolean;
  /** Metadatos para el overlay superior. */
  seenCount?: number;
  lastRating?: PhraseRating | null;
}

const LAST_RATING_LABEL: Record<PhraseRating, string> = {
  easy: 'fácil',
  ok: 'ok',
  hard: 'difícil',
};

export const PhraseCard = forwardRef<PhraseCardHandle, Props>(function PhraseCard(
  {
    phrase,
    listenState,
    onSwipeUp,
    onSwipeLeft,
    onSwipeDown,
    onSwipeRight,
    onListenPress,
    onRevealPress,
    enterFrom = 'right',
    canGoPrev = true,
    seenCount = 0,
    lastRating = null,
  },
  ref
) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const translateX = useSharedValue(enterFrom === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);

  // Progreso de revelado: 0 = borroso, 1 = revelado
  const revealProgress = useSharedValue(0);

  // Entry animation: suave, sin rebote
  useEffect(() => {
    translateX.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 220 });
    revealProgress.value = 0;
  }, [phrase.id]);

  // Animación de revelado
  useEffect(() => {
    if (listenState === 'revealed') {
      revealProgress.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) });
    } else if (listenState === 'played') {
      revealProgress.value = 0;
    }
  }, [listenState]);

  function exitLeft(onDone: () => void) {
    translateX.value = withTiming(-SCREEN_WIDTH * 1.3, { duration: 280, easing: Easing.in(Easing.cubic) }, () => runOnJS(onDone)());
    opacity.value = withTiming(0, { duration: 280 });
  }

  function exitRight(onDone: () => void) {
    translateX.value = withTiming(SCREEN_WIDTH * 1.3, { duration: 280, easing: Easing.in(Easing.cubic) }, () => runOnJS(onDone)());
    opacity.value = withTiming(0, { duration: 280 });
  }

  function exitUp(onDone: () => void) {
    translateY.value = withTiming(-SCREEN_WIDTH, { duration: 320, easing: Easing.in(Easing.cubic) }, () => runOnJS(onDone)());
    translateX.value = withTiming((Math.random() - 0.5) * 150, { duration: 320 });
    scale.value = withTiming(0.7, { duration: 320 });
    opacity.value = withTiming(0, { duration: 320 });
  }

  function exitDown(onDone: () => void) {
    translateY.value = withTiming(SCREEN_WIDTH, { duration: 320, easing: Easing.in(Easing.cubic) }, () => runOnJS(onDone)());
    translateX.value = withTiming((Math.random() - 0.5) * 100, { duration: 320 });
    scale.value = withTiming(0.8, { duration: 320 });
    opacity.value = withTiming(0, { duration: 320 });
  }

  // Permite al padre disparar las animaciones como si fueran swipes (útil
  // para los botones, que así enseñan visualmente el gesto correspondiente).
  useImperativeHandle(ref, () => ({
    triggerEasy: () => exitUp(onSwipeUp),
    triggerOk: () => exitLeft(onSwipeLeft),
    triggerHard: () => exitDown(onSwipeDown),
    triggerPrev: () => { if (canGoPrev) exitRight(onSwipeRight); },
  }));

  const panGesture = Gesture.Pan()
    .onEnd((e) => {
      const { translationX, translationY, velocityX, velocityY } = e;

      // Prioriza el eje con mayor desplazamiento para evitar ambigüedad.
      if (Math.abs(translationY) > Math.abs(translationX)) {
        if (translationY < -SWIPE_VERTICAL_THRESHOLD || velocityY < -600) {
          runOnJS(exitUp)(onSwipeUp);
          return;
        }
        if (translationY > SWIPE_VERTICAL_THRESHOLD || velocityY > 600) {
          runOnJS(exitDown)(onSwipeDown);
          return;
        }
      }
      if (translationX > SWIPE_THRESHOLD || velocityX > 600) {
        if (canGoPrev) runOnJS(exitRight)(onSwipeRight);
        return;
      }
      if (translationX < -SWIPE_THRESHOLD || velocityX < -600) {
        runOnJS(exitLeft)(onSwipeLeft);
        return;
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const revealedTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(revealProgress.value, [0, 1], [theme.card, theme.cyan]),
  }));

  const maskedEnglish = phrase.english.replace(/[^\s]/g, '•');

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, cardAnimatedStyle]}>
        {/* Overlay superior: visto N · última: X */}
        <View style={styles.overlayRow}>
          <Text style={styles.overlayText}>
            Visto {seenCount} · Última: {lastRating ? LAST_RATING_LABEL[lastRating] : '—'}
          </Text>
        </View>

        {/* Spanish phrase */}
        <View style={styles.phraseContainer}>
          <Text style={styles.spanish}>{phrase.spanish}</Text>

          {listenState === 'idle' && (
            <Text style={[styles.english, { color: theme.card }]}>
              {phrase.english}
            </Text>
          )}
          {listenState === 'played' && (
            <TouchableOpacity onPress={onRevealPress} activeOpacity={0.7}>
              <Text style={[styles.english, { color: theme.cyan }]}>
                {maskedEnglish}
              </Text>
            </TouchableOpacity>
          )}
          {listenState === 'revealed' && (
            <Animated.Text style={[styles.english, revealedTextStyle]}>
              {phrase.english}
            </Animated.Text>
          )}
        </View>

        {/* Controles inferiores */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={styles.listenBtn}
            onPress={onListenPress}
            activeOpacity={0.75}
          >
            <Ionicons name="volume-high-outline" size={22} color={theme.onPrimary} />
            <Text style={styles.listenText}>Listen</Text>
          </TouchableOpacity>

          {/* Fila de calificación: Difícil / OK / Fácil */}
          <View style={styles.rateRow}>
            <TouchableOpacity
              style={[styles.rateBtn, { borderColor: theme.orange }]}
              onPress={() => exitDown(onSwipeDown)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rateText, { color: theme.orange }]}>↓ Difícil</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rateBtn, { borderColor: theme.primary }]}
              onPress={() => exitLeft(onSwipeLeft)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rateText, { color: theme.primary }]}>← OK</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rateBtn, { borderColor: theme.success }]}
              onPress={() => exitUp(onSwipeUp)}
              activeOpacity={0.7}
            >
              <Text style={[styles.rateText, { color: theme.success }]}>↑ Fácil</Text>
            </TouchableOpacity>
          </View>

          {/* Fila de navegación: atrás */}
          <View style={styles.navRow}>
            {canGoPrev ? (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => exitRight(onSwipeRight)}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={18} color={theme.inactive} />
                <Text style={styles.backText}>Atrás</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.backPlaceholder} />
            )}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    card: {
      width: SCREEN_WIDTH - 40,
      minHeight: 460,
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.cardBorder,
      padding: 24,
      paddingTop: 16,
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.name === 'dark' ? 0.5 : 0.12,
      shadowRadius: 20,
      elevation: 12,
    },
    overlayRow: {
      width: '100%',
      alignItems: 'flex-start',
    },
    overlayText: {
      fontSize: 11,
      color: theme.textSub,
      opacity: 0.7,
    },
    phraseContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 20,
      gap: 20,
    },
    spanish: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.textBold,
      textAlign: 'center',
      lineHeight: 38,
    },
    english: {
      fontSize: 20,
      fontWeight: '400',
      textAlign: 'center',
      lineHeight: 28,
      marginTop: 8,
    },
    bottomSection: {
      width: '100%',
      gap: 10,
      alignItems: 'center',
    },
    listenBtn: {
      backgroundColor: theme.primary,
      paddingVertical: 14,
      paddingHorizontal: 40,
      borderRadius: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    listenText: {
      color: theme.onPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    rateRow: {
      flexDirection: 'row',
      gap: 8,
      width: '100%',
      marginTop: 4,
    },
    rateBtn: {
      flex: 1,
      alignItems: 'center',
      borderWidth: 1.5,
      borderRadius: 40,
      paddingVertical: 10,
    },
    rateText: {
      fontSize: 13,
      fontWeight: '700',
    },
    navRow: {
      width: '100%',
      alignItems: 'center',
      marginTop: 2,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 14,
    },
    backText: {
      fontSize: 12,
      color: theme.inactive,
    },
    backPlaceholder: {
      height: 30,
    },
  });
}
