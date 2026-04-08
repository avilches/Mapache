import React, { useEffect } from 'react';
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
import { useTheme } from '../theme';
import { Phrase } from '../db/queries';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;
const SWIPE_UP_THRESHOLD = 60;

type ListenState = 'idle' | 'playing' | 'played' | 'revealed';

interface Props {
  phrase: Phrase;
  listenState: ListenState;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp: () => void;
  onListenPress: () => void;
  onRevealPress: () => void;
  enterFrom?: 'right' | 'left';
  canGoPrev?: boolean;
}

export function PhraseCard({
  phrase,
  listenState,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onListenPress,
  onRevealPress,
  enterFrom = 'right',
  canGoPrev = true,
}: Props) {
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

  const panGesture = Gesture.Pan()
    .onEnd((e) => {
      const { translationX, translationY, velocityX, velocityY } = e;

      if (translationY < -SWIPE_UP_THRESHOLD || velocityY < -600) {
        runOnJS(exitUp)(onSwipeUp);
        return;
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
            <Text style={styles.listenText}>🔊  Listen</Text>
          </TouchableOpacity>

          <View style={styles.navRow}>
            {canGoPrev ? (
              <TouchableOpacity
                style={styles.arrowBtn}
                onPress={() => exitRight(onSwipeRight)}
                activeOpacity={0.7}
              >
                <Text style={styles.arrowText}>←</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.arrowPlaceholder} />
            )}

            <TouchableOpacity
              style={styles.learnedBtn}
              onPress={() => exitUp(onSwipeUp)}
              activeOpacity={0.7}
            >
              <Text style={styles.learnedText}>↑ Aprendido!</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.arrowBtn}
              onPress={() => exitLeft(onSwipeLeft)}
              activeOpacity={0.7}
            >
              <Text style={styles.arrowText}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    card: {
      width: SCREEN_WIDTH - 40,
      minHeight: 420,
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.cardBorder,
      padding: 28,
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: theme.name === 'dark' ? 0.5 : 0.12,
      shadowRadius: 20,
      elevation: 12,
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
      gap: 12,
      alignItems: 'center',
    },
    learnedBtn: {
      flex: 1,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: theme.success,
      borderRadius: 50,
      paddingVertical: 10,
    },
    learnedText: {
      color: theme.success,
      fontSize: 15,
      fontWeight: '700',
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      width: '100%',
    },
    listenBtn: {
      backgroundColor: theme.primary,
      paddingVertical: 14,
      paddingHorizontal: 40,
      borderRadius: 50,
      alignItems: 'center',
    },
    listenText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    arrowPlaceholder: {
      width: 52,
      height: 52,
    },
    arrowBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.inactive + '28',
      borderWidth: 1,
      borderColor: theme.inactive + '40',
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowText: {
      fontSize: 22,
      color: theme.inactive,
    },
  });
}
