import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useSettingsStore } from '../store/settingsStore';
export function HomeScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { lastTopicId } = useSettingsStore();

  const pulseScale = useSharedValue(1);
  const floatY = useSharedValue(0);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.0, { duration: 1400, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    floatY.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }, { translateY: floatY.value }],
  }));

  const gradientColors = theme.name === 'dark'
    ? [theme.bg, theme.bgAlt, '#0a3f4f'] as const
    : [theme.bgAlt, theme.bg, '#d8f0ee'] as const;

  function handleMainAction() {
    if (lastTopicId) {
      navigation.navigate('LevelList', { topicId: lastTopicId });
    } else {
      navigation.navigate('TopicList');
    }
  }

  return (
    <LinearGradient colors={gradientColors} style={styles.container}>
      <StatusBar barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'} />

      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <Text style={styles.logoEmoji}>🌍</Text>
        <Text style={styles.title}>LinguaTrainer</Text>
        <Text style={styles.subtitle}>Aprende inglés frase a frase</Text>
      </Animated.View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomLeft} />

        <TouchableOpacity
          style={styles.mainBtn}
          onPress={handleMainAction}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[theme.primary, theme.cyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.mainBtnGradient}
          >
            <Text style={styles.mainBtnText}>
              {lastTopicId ? 'Volver al tema' : 'Empezar'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionsBtn}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={22} color={theme.textSub} />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingBottom: 0,
    },
    logoContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoEmoji: {
      fontSize: 90,
      marginBottom: 16,
    },
    title: {
      fontSize: 40,
      fontWeight: '800',
      color: theme.textBold,
      letterSpacing: 1,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: theme.textSub,
      letterSpacing: 0.5,
    },
    bottomBar: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 48,
      paddingTop: 16,
      backgroundColor: theme.bgAlt + 'cc',
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    bottomLeft: {
      width: 52,
    },
    mainBtn: {
      flex: 1,
      borderRadius: 50,
      overflow: 'hidden',
      marginHorizontal: 12,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    },
    mainBtnGradient: {
      paddingVertical: 18,
      borderRadius: 50,
      alignItems: 'center',
    },
    mainBtnText: {
      color: theme.onPrimary,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    optionsBtn: {
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 26,
      backgroundColor: theme.bgPanel,
      borderWidth: 1,
      borderColor: theme.border,
    },
  });
}
