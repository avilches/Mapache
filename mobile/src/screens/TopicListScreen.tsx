import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { getTopics, Topic } from '../db/queries';
import { useSettingsStore } from '../store/settingsStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'TopicList'>;

export function TopicListScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const insets = useSafeAreaInsets();
  const { setLastTopic } = useSettingsStore();
  const [topics, setTopics] = useState<Topic[]>([]);

  useFocusEffect(useCallback(() => { getTopics().then(setTopics); }, []));

  async function handleSelectTopic(t: Topic) {
    await setLastTopic(t.id);
    navigation.navigate('LevelList', { topicId: t.id });
  }

  const gradientColors = theme.name === 'dark'
    ? [theme.bg, theme.bgAlt] as const
    : [theme.bgAlt, theme.bg] as const;

  return (
    <LinearGradient colors={gradientColors} style={styles.container}>
      <StatusBar barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Elige un tema</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsBtn}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={topics}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { borderLeftColor: item.color, borderLeftWidth: 4 }]}
            onPress={() => handleSelectTopic(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardArrow}>›</Text>
          </TouchableOpacity>
        )}
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
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: theme.textBold,
    },
    settingsBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
      backgroundColor: theme.bgPanel,
      borderWidth: 1,
      borderColor: theme.border,
    },
    settingsIcon: { fontSize: 20 },
    list: {
      padding: 16,
      gap: 12,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.cardBorder,
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: theme.name === 'dark' ? 0.25 : 0.05,
      shadowRadius: 8,
      elevation: 4,
    },
    cardIcon: { fontSize: 32 },
    cardName: {
      flex: 1,
      fontSize: 20,
      fontWeight: '700',
      color: theme.textBold,
    },
    cardArrow: {
      fontSize: 26,
      color: theme.inactive,
    },
  });
}
