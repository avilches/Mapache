/**
 * Tests for src/db/queries.ts
 *
 * queries.ts is a thin layer over appStore, so these tests verify the
 * query logic (filtering, sorting, progress aggregation) in isolation.
 */

// Data fixtures
const MOCK_META_TEST: Record<string, any> = {
  id: 'test-basic-1',
  topicId: 'test',
  title: 'Test Basic 1',
  difficulty: 1,
  dateAdded: '2024-01-01',
  source: 'bundled',
};

const MOCK_META_INTERM: Record<string, any> = {
  id: 'test-interm-1',
  topicId: 'test',
  title: 'Test Interm 1',
  difficulty: 2,
  dateAdded: '2024-02-01',
  source: 'bundled',
};

const MOCK_META_OTHER_TOPIC: Record<string, any> = {
  id: 'other-basic-1',
  topicId: 'other',
  title: 'Other Basic 1',
  difficulty: 1,
  dateAdded: '2024-01-01',
  source: 'bundled',
};

const TWO_PHRASES = [
  { spanish: 'Hola', english: 'Hello' },
  { spanish: 'Adiós', english: 'Goodbye' },
];

const THREE_PHRASES = [
  { spanish: 'Mesa', english: 'Table' },
  { spanish: 'Silla', english: 'Chair' },
  { spanish: 'Puerta', english: 'Door' },
];

function seedLevel(meta: Record<string, any>, phrases: any[]) {
  const { _seedFile } = require('expo-file-system/legacy');
  const levelDir = `file:///mock-document/levels/${meta.id}/`;
  _seedFile(levelDir + 'meta.json', JSON.stringify(meta));
  _seedFile(levelDir + 'phrases.json', JSON.stringify(phrases));
}

beforeEach(() => {
  jest.resetModules();

  const { _resetFs } = require('expo-file-system/legacy');
  _resetFs();

  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  AsyncStorage.clear();
  jest.clearAllMocks();
});

// ─── getLevelsByTopic ─────────────────────────────────────────────────────────

describe('getLevelsByTopic', () => {
  test('returns levels for the specified topic only', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);
    seedLevel(MOCK_META_INTERM, TWO_PHRASES);
    seedLevel(MOCK_META_OTHER_TOPIC, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('test');

    expect(levels).toHaveLength(2);
    expect(levels.every((l: any) => l.topic_id === 'test')).toBe(true);
  });

  test('returns empty array when topic has no levels', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('nonexistent');

    expect(levels).toHaveLength(0);
  });

  test('difficultyFilter=1 returns only basic levels', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);   // difficulty 1
    seedLevel(MOCK_META_INTERM, TWO_PHRASES); // difficulty 2

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('test', 1);

    expect(levels).toHaveLength(1);
    expect(levels[0].difficulty).toBe(1);
    expect(levels[0].id).toBe('test-basic-1');
  });

  test('difficultyFilter=2 returns only intermediate levels', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);
    seedLevel(MOCK_META_INTERM, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('test', 2);

    expect(levels).toHaveLength(1);
    expect(levels[0].difficulty).toBe(2);
  });

  test('difficultyFilter=0 returns all levels', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);
    seedLevel(MOCK_META_INTERM, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('test', 0);

    expect(levels).toHaveLength(2);
  });

  test('levels are sorted alphabetically by id', async () => {
    // Seed in reverse filesystem order; sort must be by id
    seedLevel(MOCK_META_INTERM, TWO_PHRASES); // test-interm-1
    seedLevel(MOCK_META_TEST, TWO_PHRASES);   // test-basic-1

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('test');

    expect(levels[0].id).toBe('test-basic-1');
    expect(levels[1].id).toBe('test-interm-1');
  });

  test('learned_count is 0 when no phrases are marked learned', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const [level] = await getLevelsByTopic('test');

    expect(level.learned_count).toBe(0);
  });

  test('learned_count reflects marked phrases', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    setPhraseProgressEntry('test-basic-1-1', { learned: true, seenCount: 1 });

    const { getLevelsByTopic } = require('../src/db/queries');
    const [level] = await getLevelsByTopic('test');

    expect(level.learned_count).toBe(1);
  });

  test('completed_sessions comes from levelProgress', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, setLevelProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    setLevelProgressEntry('test-basic-1', { completedSessions: 3, lastPlayedAt: null });

    const { getLevelsByTopic } = require('../src/db/queries');
    const [level] = await getLevelsByTopic('test');

    expect(level.completed_sessions).toBe(3);
  });
});

// ─── getActivePhrases ─────────────────────────────────────────────────────────

describe('getActivePhrases', () => {
  test('returns all phrases when none are learned', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getActivePhrases } = require('../src/db/queries');
    const active = await getActivePhrases('test-basic-1');

    expect(active).toHaveLength(2);
  });

  test('excludes learned phrases', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    // Mark phrase 1 as learned
    setPhraseProgressEntry('test-basic-1-1', { learned: true, seenCount: 1 });

    const { getActivePhrases } = require('../src/db/queries');
    const active = await getActivePhrases('test-basic-1');

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('test-basic-1-2');
    expect(active[0].spanish).toBe('Adiós');
  });

  test('returns empty array when all phrases are learned', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    setPhraseProgressEntry('test-basic-1-1', { learned: true, seenCount: 1 });
    setPhraseProgressEntry('test-basic-1-2', { learned: true, seenCount: 1 });

    const { getActivePhrases } = require('../src/db/queries');
    const active = await getActivePhrases('test-basic-1');

    expect(active).toHaveLength(0);
  });

  test('active phrases are sorted by sort_order', async () => {
    seedLevel(MOCK_META_TEST, THREE_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getActivePhrases } = require('../src/db/queries');
    const active = await getActivePhrases('test-basic-1');

    expect(active).toHaveLength(3);
    expect(active[0].sort_order).toBe(1);
    expect(active[1].sort_order).toBe(2);
    expect(active[2].sort_order).toBe(3);
  });

  test('phrases with learned=false in progress are still active', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    // Explicitly mark as NOT learned (e.g. after a reset)
    setPhraseProgressEntry('test-basic-1-1', { learned: false, seenCount: 5 });

    const { getActivePhrases } = require('../src/db/queries');
    const active = await getActivePhrases('test-basic-1');

    expect(active).toHaveLength(2);
  });
});

// ─── markPhraseLearnedInDb ────────────────────────────────────────────────────

describe('markPhraseLearnedInDb', () => {
  test('marks phrase as learned and increments seenCount', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { markPhraseLearnedInDb } = require('../src/db/queries');
    await markPhraseLearnedInDb('test-basic-1-1', 'test-basic-1');

    const prog = getPhraseProgressFromStore()['test-basic-1-1'];
    expect(prog.learned).toBe(true);
    expect(prog.seenCount).toBe(1);
  });

  test('increments seenCount on top of existing value', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry, getPhraseProgressFromStore } =
      require('../src/store/appStore');
    await scanInstalledLevels();

    setPhraseProgressEntry('test-basic-1-1', { learned: false, seenCount: 4 });

    const { markPhraseLearnedInDb } = require('../src/db/queries');
    await markPhraseLearnedInDb('test-basic-1-1', 'test-basic-1');

    const prog = getPhraseProgressFromStore()['test-basic-1-1'];
    expect(prog.learned).toBe(true);
    expect(prog.seenCount).toBe(5);
  });

  test('saveProgress is called after marking learned', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const AsyncStorage = require('@react-native-async-storage/async-storage').default;

    const { markPhraseLearnedInDb } = require('../src/db/queries');
    await markPhraseLearnedInDb('test-basic-1-1', 'test-basic-1');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('progress', expect.any(String));
  });
});

// ─── markPhraseSeenInDb ───────────────────────────────────────────────────────

describe('markPhraseSeenInDb', () => {
  test('increments seenCount without changing learned', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { markPhraseSeenInDb } = require('../src/db/queries');
    await markPhraseSeenInDb('test-basic-1-1', 'test-basic-1');
    await markPhraseSeenInDb('test-basic-1-1', 'test-basic-1');

    const prog = getPhraseProgressFromStore()['test-basic-1-1'];
    expect(prog.seenCount).toBe(2);
    expect(prog.learned).toBe(false);
  });
});

// ─── resetLevelProgress ───────────────────────────────────────────────────────

describe('resetLevelProgress', () => {
  test('sets all phrases back to learned=false and seenCount=0', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry, getPhraseProgressFromStore } =
      require('../src/store/appStore');
    await scanInstalledLevels();

    // Seed some existing progress
    setPhraseProgressEntry('test-basic-1-1', { learned: true, seenCount: 5 });
    setPhraseProgressEntry('test-basic-1-2', { learned: true, seenCount: 3 });

    const { resetLevelProgress } = require('../src/db/queries');
    await resetLevelProgress('test-basic-1');

    const progress = getPhraseProgressFromStore();
    expect(progress['test-basic-1-1']).toEqual({ learned: false, seenCount: 0 });
    expect(progress['test-basic-1-2']).toEqual({ learned: false, seenCount: 0 });
  });

  test('after reset all phrases become active again', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    setPhraseProgressEntry('test-basic-1-1', { learned: true, seenCount: 1 });
    setPhraseProgressEntry('test-basic-1-2', { learned: true, seenCount: 1 });

    const { resetLevelProgress, getActivePhrases } = require('../src/db/queries');
    await resetLevelProgress('test-basic-1');

    const active = await getActivePhrases('test-basic-1');
    expect(active).toHaveLength(2);
  });

  test('saveProgress is called after reset', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const AsyncStorage = require('@react-native-async-storage/async-storage').default;

    const { resetLevelProgress } = require('../src/db/queries');
    await resetLevelProgress('test-basic-1');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('progress', expect.any(String));
  });
});

// ─── completeLevel ────────────────────────────────────────────────────────────

describe('completeLevel', () => {
  test('increments completedSessions and sets lastPlayedAt', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, getLevelProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { completeLevel } = require('../src/db/queries');
    await completeLevel('test-basic-1');

    const lp = getLevelProgressFromStore()['test-basic-1'];
    expect(lp.completedSessions).toBe(1);
    expect(lp.lastPlayedAt).toBeTruthy();
    expect(typeof lp.lastPlayedAt).toBe('string');
  });

  test('calling twice increments to 2', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels, getLevelProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { completeLevel } = require('../src/db/queries');
    await completeLevel('test-basic-1');
    await completeLevel('test-basic-1');

    const lp = getLevelProgressFromStore()['test-basic-1'];
    expect(lp.completedSessions).toBe(2);
  });
});
