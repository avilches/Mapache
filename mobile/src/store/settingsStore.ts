import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CEFRLevel } from './appStore';

type ThemeMode = 'system' | 'light' | 'dark';

const LEGACY_FILTER_MAP: Record<string, '' | CEFRLevel> = {
  '0': '', '1': 'A1', '2': 'A2', '3': 'B1', '4': 'B2', '5': 'C1', '6': 'C2',
};

function migrateDifficultyFilter(stored: string): '' | CEFRLevel {
  if (stored in LEGACY_FILTER_MAP) return LEGACY_FILTER_MAP[stored];
  const valid: ('' | CEFRLevel)[] = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  return valid.includes(stored as any) ? (stored as '' | CEFRLevel) : '';
}

interface SettingsStore {
  themeMode: ThemeMode;
  difficultyFilter: '' | CEFRLevel;
  seenLevelIds: string[];
  lastTopicId: string | null;
  setThemeMode: (mode: ThemeMode) => void;
  setDifficultyFilter: (difficulty: '' | CEFRLevel) => void;
  markLevelSeen: (levelId: string) => void;
  setLastTopic: (id: string) => Promise<void>;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  themeMode: 'system',
  difficultyFilter: '',
  seenLevelIds: [],
  lastTopicId: null,

  setThemeMode: async (mode) => {
    set({ themeMode: mode });
    await AsyncStorage.setItem('themeMode', mode);
  },

  setDifficultyFilter: async (difficulty) => {
    set({ difficultyFilter: difficulty });
    await AsyncStorage.setItem('difficultyFilter', difficulty);
  },

  markLevelSeen: async (levelId) => {
    const current = get().seenLevelIds;
    if (current.includes(levelId)) return;
    const updated = [...current, levelId];
    set({ seenLevelIds: updated });
    await AsyncStorage.setItem('seenLevelIds', JSON.stringify(updated));
  },

  setLastTopic: async (id) => {
    set({ lastTopicId: id });
    await AsyncStorage.setItem('lastTopicId', id);
  },

  loadSettings: async () => {
    const [savedTheme, savedFilter, savedSeen, savedTopic] = await Promise.all([
      AsyncStorage.getItem('themeMode'),
      AsyncStorage.getItem('difficultyFilter'),
      AsyncStorage.getItem('seenLevelIds'),
      AsyncStorage.getItem('lastTopicId'),
    ]);
    const updates: Partial<SettingsStore> = {};
    if (savedTheme) updates.themeMode = savedTheme as ThemeMode;
    if (savedFilter !== null) updates.difficultyFilter = migrateDifficultyFilter(savedFilter);
    if (savedSeen) updates.seenLevelIds = JSON.parse(savedSeen);
    if (savedTopic) updates.lastTopicId = savedTopic;
    set(updates);
  },
}));
