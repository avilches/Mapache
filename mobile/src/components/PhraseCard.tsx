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
  withSpring,
  runOnJS,
  Easing,
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
  enterFrom?: 'right' | 'left';
}

export function PhraseCard({
  phrase,
  listenState,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onListenPress,
  enterFrom = 'right',
}: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const translateX = useSharedValue(enterFrom === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  // Entry animation
  useEffect(() => {
    translateX.value = withSpring(0, { damping: 20, stiffness: 180 });
    opacity.value = withTiming(1, { duration: 250 });
    scale.value = withSpring(1, { damping: 20, stiffness: 200 });
  }, [phrase.id]);

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
    .onUpdate((e) => {
      translateX.value = e.translationX * 0.4;
      translateY.value = e.translationY * 0.4;
    })
    .onEnd((e) => {
      const { translationX, translationY, velocityX, velocityY } = e;

      if (translationY < -SWIPE_UP_THRESHOLD || velocityY < -600) {
        runOnJS(exitUp)(onSwipeUp);
        return;
      }
      if (translationX > SWIPE_THRESHOLD || velocityX > 600) {
        runOnJS(exitRight)(onSwipeRight);
        return;
      }
      if (translationX < -SWIPE_THRESHOLD || velocityX < -600) {
        runOnJS(exitLeft)(onSwipeLeft);
        return;
      }

      // Snap back
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const listenLabel =
    listenState === 'idle' ? '🔊  Listen' :
    listenState === 'playing' ? '🔉  Playing...' :
    listenState === 'played' ? '👁  Reveal' :
    '🔊  Listen again';

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, animatedStyle]}>
        {/* Swipe hints */}
        <View style={styles.hintsRow}>
          <Text style={styles.hint}>← anterior</Text>
          <Text style={styles.hint}>aprendido ↑</Text>
          <Text style={styles.hint}>siguiente →</Text>
        </View>

        {/* Spanish phrase */}
        <View style={styles.phraseContainer}>
          <Text style={styles.spanish}>{phrase.spanish}</Text>
          {listenState === 'revealed' && (
            <Text style={styles.english}>{phrase.english}</Text>
          )}
        </View>

        {/* Listen button */}
        <TouchableOpacity
          style={[
            styles.listenBtn,
            (listenState === 'playing' || listenState === 'played') && styles.listenBtnActive,
          ]}
          onPress={onListenPress}
          activeOpacity={0.75}
        >
          <Text style={styles.listenText}>{listenLabel}</Text>
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    card: {
      width: SCREEN_WIDTH - 40,
      minHeight: 320,
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
    hintsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginBottom: 8,
    },
    hint: {
      fontSize: 10,
      color: theme.inactive,
      opacity: 0.6,
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
      color: theme.cyan,
      textAlign: 'center',
      lineHeight: 28,
      marginTop: 8,
    },
    listenBtn: {
      backgroundColor: theme.primary,
      paddingVertical: 14,
      paddingHorizontal: 40,
      borderRadius: 50,
      marginTop: 8,
    },
    listenBtnActive: {
      backgroundColor: theme.cyan,
    },
    listenText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
