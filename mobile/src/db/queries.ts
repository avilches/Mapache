import {
  getTopicsFromStore,
  getLevelsFromStore,
  getPhrasesFromStore,
  getPhraseProgressFromStore,
  getLevelProgressFromStore,
  setPhraseProgressEntry,
  setLevelProgressEntry,
  deleteLevelFromStore,
  saveProgress,
} from '../store/appStore';

export type { Topic, Level, Phrase } from '../store/appStore';

export interface PhraseProgress {
  phrase_id: string;
  level_id: string;
  learned: boolean;
  seen_count: number;
}

export interface LevelWithProgress {
  id: string;
  topic_id: string;
  title: string;
  difficulty: 1 | 2 | 3;
  sort_order: number;
  date_added: string;
  total_phrases: number;
  source: string;
  learned_count: number;
  completed_sessions: number;
}

// ─── Topics ───────────────────────────────────────────────────────────────────

export async function getTopics() {
  return getTopicsFromStore();
}

// ─── Levels ───────────────────────────────────────────────────────────────────

export async function getLevelsByTopic(
  topicId: string,
  difficultyFilter: 0 | 1 | 2 | 3 = 0
): Promise<LevelWithProgress[]> {
  const phraseProgress = getPhraseProgressFromStore();
  const levelProgress = getLevelProgressFromStore();
  const phrases = getPhrasesFromStore();

  let filtered = getLevelsFromStore().filter(l => l.topic_id === topicId);
  if (difficultyFilter > 0) filtered = filtered.filter(l => l.difficulty === difficultyFilter);
  filtered = [...filtered].sort((a, b) => a.sort_order - b.sort_order || a.date_added.localeCompare(b.date_added));

  return filtered.map(level => {
    const levelPhraseIds = phrases.filter(p => p.level_id === level.id).map(p => p.id);
    const learned_count = levelPhraseIds.filter(id => phraseProgress[id]?.learned).length;
    const lp = levelProgress[level.id];
    return {
      ...level,
      learned_count,
      completed_sessions: lp?.completedSessions ?? 0,
    };
  });
}

// ─── Phrases ──────────────────────────────────────────────────────────────────

export async function getPhrasesByLevel(levelId: string) {
  return getPhrasesFromStore()
    .filter(p => p.level_id === levelId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function getActivePhrases(levelId: string) {
  const phraseProgress = getPhraseProgressFromStore();
  return getPhrasesFromStore()
    .filter(p => p.level_id === levelId && !phraseProgress[p.id]?.learned)
    .sort((a, b) => a.sort_order - b.sort_order);
}

// ─── Progress mutations ───────────────────────────────────────────────────────

export async function markPhraseLearnedInDb(phraseId: string, _levelId: string): Promise<void> {
  const prev = getPhraseProgressFromStore()[phraseId];
  setPhraseProgressEntry(phraseId, {
    learned: true,
    seenCount: (prev?.seenCount ?? 0) + 1,
  });
  await saveProgress();
}

export async function markPhraseSeenInDb(phraseId: string, _levelId: string): Promise<void> {
  const prev = getPhraseProgressFromStore()[phraseId];
  setPhraseProgressEntry(phraseId, {
    learned: prev?.learned ?? false,
    seenCount: (prev?.seenCount ?? 0) + 1,
  });
  await saveProgress();
}

export async function completeLevel(levelId: string): Promise<void> {
  const prev = getLevelProgressFromStore()[levelId];
  setLevelProgressEntry(levelId, {
    completedSessions: (prev?.completedSessions ?? 0) + 1,
    lastPlayedAt: new Date().toISOString(),
  });
  await saveProgress();
}

export async function resetLevelProgress(levelId: string): Promise<void> {
  const phrases = getPhrasesFromStore().filter(p => p.level_id === levelId);
  for (const phrase of phrases) {
    setPhraseProgressEntry(phrase.id, { learned: false, seenCount: 0 });
  }
  await saveProgress();
}

export async function getPhraseProgressForLevel(levelId: string): Promise<PhraseProgress[]> {
  const phraseProgress = getPhraseProgressFromStore();
  const phrases = getPhrasesFromStore().filter(p => p.level_id === levelId);
  return phrases.map(p => ({
    phrase_id: p.id,
    level_id: levelId,
    learned: phraseProgress[p.id]?.learned ?? false,
    seen_count: phraseProgress[p.id]?.seenCount ?? 0,
  }));
}

// ─── Downloaded level helpers ─────────────────────────────────────────────────

export async function deleteLevel(levelId: string): Promise<void> {
  deleteLevelFromStore(levelId);
  await saveProgress();
}
