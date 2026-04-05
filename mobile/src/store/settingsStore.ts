import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsStore {
  themeMode: ThemeMode;
  difficultyFilter: 0 | 1 | 2 | 3;
  seenLevelIds: string[];
  lastTopicId: string | null;
  setThemeMode: (mode: ThemeMode) => void;
  setDifficultyFilter: (difficulty: 0 | 1 | 2 | 3) => void;
  markLevelSeen: (levelId: string) => void;
  setLastTopic: (id: string) => Promise<void>;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  themeMode: 'system',
  difficultyFilter: 0,
  seenLevelIds: [],
  lastTopicId: null,

  setThemeMode: async (mode) => {
    set({ themeMode: mode });
    await AsyncStorage.setItem('themeMode', mode);
  },

  setDifficultyFilter: async (difficulty) => {
    set({ difficultyFilter: difficulty });
    await AsyncStorage.setItem('difficultyFilter', String(difficulty));
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
    if (savedFilter) updates.difficultyFilter = Number(savedFilter) as 0 | 1 | 2 | 3;
    if (savedSeen) updates.seenLevelIds = JSON.parse(savedSeen);
    if (savedTopic) updates.lastTopicId = savedTopic;
    set(updates);
  },
}));
