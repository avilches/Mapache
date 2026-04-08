/**
 * Tests for src/store/appStore.ts
 *
 * Because appStore uses module-level mutable state (let themes, levels, etc.),
 * we reset Jest modules before each test so every test starts with a clean slate.
 */

// These are resolved fresh per-test via jest.isolateModules / require()
import type {
  Topic,
  Level,
  Phrase,
} from '../src/store/appStore';

// Helpers to build mock level data
const LEVEL_DIR = 'file:///mock-document/levels/test-basic-1/';

const MOCK_TOPIC = { id: 'test', name: 'Test', icon: '🧪', color: '#268bd2' };

const MOCK_META = {
  id: 'test-basic-1',
  topicId: 'test',
  title: 'Test level',
  difficulty: 1,
  dateAdded: '2024-01-01',
  source: 'bundled',
};

const MOCK_PHRASES = [
  { spanish: 'Hola', english: 'Hello' },
  { spanish: 'Adiós', english: 'Goodbye' },
];

function seedMockLevel() {
  // Seed the in-memory filesystem mock with level files
  const { _seedFile } = require('expo-file-system/legacy');
  _seedFile(LEVEL_DIR + 'meta.json', JSON.stringify(MOCK_META));
  _seedFile(LEVEL_DIR + 'phrases.json', JSON.stringify(MOCK_PHRASES));
  _seedFile(LEVEL_DIR + 'topic.json', JSON.stringify(MOCK_TOPIC));
}

beforeEach(() => {
  // Reset module registry so appStore state is fresh
  jest.resetModules();

  // Reset filesystem mock
  const { _resetFs } = require('expo-file-system/legacy');
  _resetFs();

  // Reset AsyncStorage mock
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  AsyncStorage.clear();
  jest.clearAllMocks();
});

// ─── loadProgress / saveProgress ─────────────────────────────────────────────

describe('loadProgress / saveProgress', () => {
  test('loadProgress with no stored data leaves progress empty', async () => {
    const {
      loadProgress,
      getPhraseProgressFromStore,
      getLevelProgressFromStore,
    } = require('../src/store/appStore');

    await loadProgress();

    expect(getPhraseProgressFromStore()).toEqual({});
    expect(getLevelProgressFromStore()).toEqual({});
  });

  test('saveProgress persists and loadProgress restores data', async () => {
    const {
      loadProgress,
      saveProgress,
      setPhraseProgressEntry,
      setLevelProgressEntry,
      getPhraseProgressFromStore,
      getLevelProgressFromStore,
    } = require('../src/store/appStore');

    setPhraseProgressEntry('phrase-1', { learned: true, seenCount: 3 });
    setLevelProgressEntry('level-1', { completedSessions: 2, lastPlayedAt: '2024-01-01T00:00:00.000Z' });

    await saveProgress();

    // Reset module state by re-requiring (simulate fresh app start)
    jest.resetModules();
    const store2 = require('../src/store/appStore');

    await store2.loadProgress();

    expect(store2.getPhraseProgressFromStore()['phrase-1']).toEqual({
      learned: true,
      seenCount: 3,
    });
    expect(store2.getLevelProgressFromStore()['level-1']).toEqual({
      completedSessions: 2,
      lastPlayedAt: '2024-01-01T00:00:00.000Z',
      totalListens: 0,
      totalTimeSeconds: 0,
    });
  });

  test('loadProgress with partial data (only phraseProgress key)', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('progress', JSON.stringify({ phraseProgress: { 'p-1': { learned: false, seenCount: 1 } } }));

    const { loadProgress, getPhraseProgressFromStore, getLevelProgressFromStore } = require('../src/store/appStore');
    await loadProgress();

    expect(getPhraseProgressFromStore()['p-1']).toEqual({ learned: false, seenCount: 1 });
    expect(getLevelProgressFromStore()).toEqual({});
  });
});

// ─── scanInstalledLevels ───────────────────────────────────────────────────────

describe('scanInstalledLevels', () => {
  test('empty levels dir produces empty store', async () => {
    const { scanInstalledLevels, getTopicsFromStore, getLevelsFromStore, getPhrasesFromStore } =
      require('../src/store/appStore');

    await scanInstalledLevels();

    expect(getTopicsFromStore()).toEqual([]);
    expect(getLevelsFromStore()).toEqual([]);
    expect(getPhrasesFromStore()).toEqual([]);
  });

  test('one level populates topics, levels and phrases', async () => {
    seedMockLevel();

    const { scanInstalledLevels, getTopicsFromStore, getLevelsFromStore, getPhrasesFromStore } =
      require('../src/store/appStore');

    await scanInstalledLevels();

    const topics: Topic[] = getTopicsFromStore();
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      id: 'test',
      name: 'Test',
      icon: '🧪',
      color: '#268bd2',
    });

    const levels: Level[] = getLevelsFromStore();
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({
      id: 'test-basic-1',
      topic_id: 'test',
      title: 'Test level',
      difficulty: 1,
      total_phrases: 2,
    });

    const phrases: Phrase[] = getPhrasesFromStore();
    expect(phrases).toHaveLength(2);
    expect(phrases[0]).toMatchObject({
      id: 'test-basic-1-1',
      level_id: 'test-basic-1',
      spanish: 'Hola',
      english: 'Hello',
      sort_order: 1,
    });
    expect(phrases[1]).toMatchObject({
      id: 'test-basic-1-2',
      level_id: 'test-basic-1',
      spanish: 'Adiós',
      english: 'Goodbye',
      sort_order: 2,
    });
  });

  test('two levels with the same topic produce a single topic entry', async () => {
    const { _seedFile } = require('expo-file-system/legacy');

    const meta2 = { ...MOCK_META, id: 'test-basic-2' };
    const level2Dir = 'file:///mock-document/levels/test-basic-2/';
    _seedFile(LEVEL_DIR + 'meta.json', JSON.stringify(MOCK_META));
    _seedFile(LEVEL_DIR + 'phrases.json', JSON.stringify(MOCK_PHRASES));
    _seedFile(LEVEL_DIR + 'topic.json', JSON.stringify(MOCK_TOPIC));
    _seedFile(level2Dir + 'meta.json', JSON.stringify(meta2));
    _seedFile(level2Dir + 'phrases.json', JSON.stringify(MOCK_PHRASES));
    _seedFile(level2Dir + 'topic.json', JSON.stringify(MOCK_TOPIC));

    const { scanInstalledLevels, getTopicsFromStore, getLevelsFromStore } =
      require('../src/store/appStore');

    await scanInstalledLevels();

    expect(getTopicsFromStore()).toHaveLength(1);
    expect(getLevelsFromStore()).toHaveLength(2);
  });

  test('audio_path is built correctly for each phrase', async () => {
    seedMockLevel();

    const { scanInstalledLevels, getPhrasesFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const phrases: Phrase[] = getPhrasesFromStore();
    expect(phrases[0].audio_path).toBe(LEVEL_DIR + 'audio/001.mp3');
    expect(phrases[1].audio_path).toBe(LEVEL_DIR + 'audio/002.mp3');
  });

  test('level with malformed meta.json is skipped gracefully', async () => {
    const { _seedFile } = require('expo-file-system/legacy');
    _seedFile(LEVEL_DIR + 'meta.json', 'NOT_JSON');
    _seedFile(LEVEL_DIR + 'phrases.json', JSON.stringify(MOCK_PHRASES));

    const { scanInstalledLevels, getLevelsFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    expect(getLevelsFromStore()).toHaveLength(0);
  });
});

// ─── setPhraseProgressEntry ───────────────────────────────────────────────────

describe('setPhraseProgressEntry', () => {
  test('creates new entry with defaults merged', () => {
    const { setPhraseProgressEntry, getPhraseProgressFromStore } = require('../src/store/appStore');

    setPhraseProgressEntry('p-1', { learned: true });

    expect(getPhraseProgressFromStore()['p-1']).toEqual({ learned: true, seenCount: 0 });
  });

  test('updates existing entry without overwriting unspecified fields', () => {
    const { setPhraseProgressEntry, getPhraseProgressFromStore } = require('../src/store/appStore');

    setPhraseProgressEntry('p-1', { learned: false, seenCount: 5 });
    setPhraseProgressEntry('p-1', { seenCount: 6 });

    expect(getPhraseProgressFromStore()['p-1']).toEqual({ learned: false, seenCount: 6 });
  });

  test('sets learned=false for brand new entry when only seenCount specified', () => {
    const { setPhraseProgressEntry, getPhraseProgressFromStore } = require('../src/store/appStore');

    setPhraseProgressEntry('p-new', { seenCount: 2 });

    expect(getPhraseProgressFromStore()['p-new'].learned).toBe(false);
    expect(getPhraseProgressFromStore()['p-new'].seenCount).toBe(2);
  });
});

// ─── setLevelProgressEntry ────────────────────────────────────────────────────

describe('setLevelProgressEntry', () => {
  test('creates entry with defaults when nothing existed', () => {
    const { setLevelProgressEntry, getLevelProgressFromStore } = require('../src/store/appStore');

    setLevelProgressEntry('level-1', { completedSessions: 1 });

    expect(getLevelProgressFromStore()['level-1']).toEqual({
      completedSessions: 1,
      lastPlayedAt: null,
      totalListens: 0,
      totalTimeSeconds: 0,
    });
  });
});

// ─── deleteLevelFromStore ─────────────────────────────────────────────────────

describe('deleteLevelFromStore', () => {
  test('removes level, its phrases, and their progress entries', async () => {
    seedMockLevel();

    const {
      scanInstalledLevels,
      setPhraseProgressEntry,
      setLevelProgressEntry,
      deleteLevelFromStore,
      getLevelsFromStore,
      getPhrasesFromStore,
      getPhraseProgressFromStore,
      getLevelProgressFromStore,
    } = require('../src/store/appStore');

    await scanInstalledLevels();

    // Seed some progress
    setPhraseProgressEntry('test-basic-1-1', { learned: true, seenCount: 3 });
    setPhraseProgressEntry('test-basic-1-2', { learned: false, seenCount: 1 });
    setLevelProgressEntry('test-basic-1', { completedSessions: 1, lastPlayedAt: '2024-01-01T00:00:00.000Z' });

    deleteLevelFromStore('test-basic-1');

    expect(getLevelsFromStore()).toHaveLength(0);
    expect(getPhrasesFromStore()).toHaveLength(0);
    expect(getPhraseProgressFromStore()['test-basic-1-1']).toBeUndefined();
    expect(getPhraseProgressFromStore()['test-basic-1-2']).toBeUndefined();
    expect(getLevelProgressFromStore()['test-basic-1']).toBeUndefined();
  });

  test('deleting unknown level id is a no-op', async () => {
    seedMockLevel();

    const { scanInstalledLevels, deleteLevelFromStore, getLevelsFromStore } =
      require('../src/store/appStore');

    await scanInstalledLevels();

    expect(() => deleteLevelFromStore('non-existent')).not.toThrow();
    expect(getLevelsFromStore()).toHaveLength(1);
  });
});
