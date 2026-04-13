/**
 * Tests for src/db/queries.ts
 *
 * queries.ts is a thin layer over appStore, so these tests verify the
 * query logic (filtering, sorting, progress aggregation) in isolation.
 *
 * Tests del algoritmo de sesión (buildSessionQueue, reinsertHard, ratePhraseInDb,
 * migración, constraint de normalización) viven en __tests__/session.test.ts.
 */

// Data fixtures
const MOCK_META_TEST: Record<string, any> = {
  id: 'test-basic-1',
  topicId: 'test',
  title: 'Test Basic 1',
  difficulty: 'A1',
  dateAdded: '2024-01-01',
  source: 'bundled',
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00',
};

const MOCK_META_INTERM: Record<string, any> = {
  id: 'test-interm-1',
  topicId: 'test',
  title: 'Test Interm 1',
  difficulty: 'A2',
  dateAdded: '2024-02-01',
  source: 'bundled',
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00',
};

const MOCK_META_OTHER_TOPIC: Record<string, any> = {
  id: 'other-basic-1',
  topicId: 'other',
  title: 'Other Basic 1',
  difficulty: 'A1',
  dateAdded: '2024-01-01',
  source: 'bundled',
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00',
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

  test('difficultyFilter=A1 returns only A1 levels', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);   // difficulty A1
    seedLevel(MOCK_META_INTERM, TWO_PHRASES); // difficulty A2

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('test', 'A1');

    expect(levels).toHaveLength(1);
    expect(levels[0].difficulty).toBe('A1');
    expect(levels[0].id).toBe('test-basic-1');
  });

  test('difficultyFilter=A2 returns only A2 levels', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);
    seedLevel(MOCK_META_INTERM, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('test', 'A2');

    expect(levels).toHaveLength(1);
    expect(levels[0].difficulty).toBe('A2');
  });

  test('difficultyFilter="" returns all levels', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);
    seedLevel(MOCK_META_INTERM, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('test', '');

    expect(levels).toHaveLength(2);
  });

  test('levels are sorted alphabetically by id', async () => {
    seedLevel(MOCK_META_INTERM, TWO_PHRASES); // test-interm-1
    seedLevel(MOCK_META_TEST, TWO_PHRASES);   // test-basic-1

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const levels = await getLevelsByTopic('test');

    expect(levels[0].id).toBe('test-basic-1');
    expect(levels[1].id).toBe('test-interm-1');
  });

  test('mastered_count is 0 when no phrases have been rated', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getLevelsByTopic } = require('../src/db/queries');
    const [level] = await getLevelsByTopic('test');

    expect(level.mastered_count).toBe(0);
  });

  test('mastered_count reflects phrases with rating below relative threshold', async () => {
    seedLevel(MOCK_META_TEST, THREE_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    // One phrase clearly below (−2), the other two at 0 → mean = −0.67, threshold = −1.67
    // So phrase 1 (rating −2) is mastered.
    setPhraseProgressEntry('test-basic-1-1', { rating: -2, seenCount: 2, lastRating: 'easy', lastSeenAt: 1 });

    const { getLevelsByTopic } = require('../src/db/queries');
    const [level] = await getLevelsByTopic('test');

    expect(level.mastered_count).toBe(1);
  });

  test('mastered_count is 0 when all phrases share the same rating (normalization constraint)', async () => {
    seedLevel(MOCK_META_TEST, THREE_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    // All phrases at the same negative rating — mean equals each rating → nothing below threshold.
    setPhraseProgressEntry('test-basic-1-1', { rating: -5, seenCount: 1, lastRating: 'easy', lastSeenAt: 1 });
    setPhraseProgressEntry('test-basic-1-2', { rating: -5, seenCount: 1, lastRating: 'easy', lastSeenAt: 1 });
    setPhraseProgressEntry('test-basic-1-3', { rating: -5, seenCount: 1, lastRating: 'easy', lastSeenAt: 1 });

    const { getLevelsByTopic } = require('../src/db/queries');
    const [level] = await getLevelsByTopic('test');

    expect(level.mastered_count).toBe(0);
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

// ─── getPhrasesByLevel ───────────────────────────────────────────────────────

describe('getPhrasesByLevel', () => {
  test('returns all phrases sorted by sort_order', async () => {
    seedLevel(MOCK_META_TEST, THREE_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getPhrasesByLevel } = require('../src/db/queries');
    const phrases = await getPhrasesByLevel('test-basic-1');

    expect(phrases).toHaveLength(3);
    expect(phrases[0].sort_order).toBe(1);
    expect(phrases[2].sort_order).toBe(3);
  });

  test('returns empty array for nonexistent level', async () => {
    seedLevel(MOCK_META_TEST, TWO_PHRASES);

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getPhrasesByLevel } = require('../src/db/queries');
    const phrases = await getPhrasesByLevel('nope');
    expect(phrases).toHaveLength(0);
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

// ─── getLevelStats ───────────────────────────────────────────────────────────

describe('getLevelStats', () => {
  test('returns masteredCount and totalPhrases', async () => {
    seedLevel(MOCK_META_TEST, THREE_PHRASES);

    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    setPhraseProgressEntry('test-basic-1-1', { rating: -2, seenCount: 1, lastRating: 'easy', lastSeenAt: 1 });

    const { getLevelStats } = require('../src/db/queries');
    const stats = getLevelStats('test-basic-1');

    expect(stats.totalPhrases).toBe(3);
    expect(stats.masteredCount).toBe(1);
  });
});
