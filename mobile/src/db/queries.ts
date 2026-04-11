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
  PhraseRating,
  PhraseProg,
  Phrase,
} from '../store/appStore';

// ─── Constantes del sistema de rating ────────────────────────────────────────

/** Sensibilidad del peso por desviación del rating sobre el promedio del nivel. */
export const K_RATING = 0.8;
/** Offset al que se reinserta una frase marcada 'hard' dentro de la cola de sesión. */
export const K_HARD_REINSERT = 4;
/** Máximo de reinserciones 'hard' por frase en la misma sesión (anti-loop). */
export const MAX_REINSERT_PER_PHRASE = 3;
/** Umbral relativo para considerar una frase "dominada": rating ≤ mean − MASTERY_MARGIN. */
export const MASTERY_MARGIN = 1;

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export interface LevelStats {
  masteredCount: number;
  totalPhrases: number;
  totalListens: number;
  totalTimeSeconds: number;
}

export type { Topic, Level, Phrase, PhraseRating } from '../store/appStore';

export interface PhraseProgress {
  phrase_id: string;
  level_id: string;
  rating: number;
  seen_count: number;
  last_rating: PhraseRating | null;
  last_seen_at: number | null;
}

export interface LevelWithProgress {
  id: string;
  topic_id: string;
  title: string;
  difficulty: 1 | 2 | 3 | 4 | 5 | 6;
  date_added: string;
  total_phrases: number;
  source: string;
  mastered_count: number;
  completed_sessions: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRating(phraseId: string): number {
  return getPhraseProgressFromStore()[phraseId]?.rating ?? 0;
}

function computeMasteredCount(levelPhraseIds: string[]): number {
  if (levelPhraseIds.length === 0) return 0;
  const ratings = levelPhraseIds.map(getRating);
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const threshold = mean - MASTERY_MARGIN;
  return ratings.filter(r => r <= threshold).length;
}

// ─── Topics ──────────────────────────────────────────────────────────────────

export async function getTopics() {
  return getTopicsFromStore();
}

// ─── Levels ──────────────────────────────────────────────────────────────────

export async function getLevelsByTopic(
  topicId: string,
  difficultyFilter: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
): Promise<LevelWithProgress[]> {
  const levelProgress = getLevelProgressFromStore();
  const phrases = getPhrasesFromStore();

  let filtered = getLevelsFromStore().filter(l => l.topic_id === topicId);
  if (difficultyFilter > 0) filtered = filtered.filter(l => l.difficulty === difficultyFilter);
  filtered = [...filtered].sort((a, b) => a.id.localeCompare(b.id));

  return filtered.map(level => {
    const levelPhraseIds = phrases.filter(p => p.level_id === level.id).map(p => p.id);
    const mastered_count = computeMasteredCount(levelPhraseIds);
    const lp = levelProgress[level.id];
    return {
      ...level,
      mastered_count,
      completed_sessions: lp?.completedSessions ?? 0,
    };
  });
}

/**
 * Devuelve el ID del siguiente nivel dentro del mismo topic, respetando el
 * difficultyFilter activo. `null` si no hay siguiente.
 */
export async function getNextLevelId(
  currentLevelId: string,
  topicId: string,
  difficultyFilter: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0
): Promise<string | null> {
  const list = await getLevelsByTopic(topicId, difficultyFilter);
  const idx = list.findIndex(l => l.id === currentLevelId);
  if (idx < 0 || idx >= list.length - 1) return null;
  return list[idx + 1].id;
}

// ─── Phrases ─────────────────────────────────────────────────────────────────

export async function getPhrasesByLevel(levelId: string) {
  return getPhrasesFromStore()
    .filter(p => p.level_id === levelId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Construye la cola de una sesión para el nivel dado.
 *
 * Algoritmo: weighted shuffle sin reemplazo (Efraimidis–Spirakis), con pesos
 * `w_i = exp(K_RATING * (rating_i - mean))`. Si todos los ratings son iguales,
 * `rating - mean = 0` para todas → pesos uniformes → shuffle aleatorio puro.
 * Esto garantiza que marcar todas las frases igual NO produce ningún efecto en
 * la ordenación (constraint de normalización relativa).
 */
export function buildSessionQueue(levelId: string): Phrase[] {
  const phrases = getPhrasesFromStore()
    .filter(p => p.level_id === levelId)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (phrases.length === 0) return [];

  const ratings = phrases.map(p => getRating(p.id));
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;

  const keyed = phrases.map((p, i) => {
    const weight = Math.exp(K_RATING * (ratings[i] - mean));
    // Efraimidis–Spirakis: key = U^(1/w), U uniforme en (0,1]. Ordenar DESC.
    const u = Math.random() || 1e-12;
    const key = Math.pow(u, 1 / weight);
    return { phrase: p, key };
  });

  keyed.sort((a, b) => b.key - a.key);
  return keyed.map(k => k.phrase);
}

/**
 * Reinserta una frase marcada 'hard' en la cola. Devuelve la nueva cola (no
 * muta el array original). Si ya se alcanzó MAX_REINSERT_PER_PHRASE para esa
 * frase, devuelve la cola sin cambios.
 */
export function reinsertHard(
  queue: Phrase[],
  cursor: number,
  phrase: Phrase,
  reinsertCount: Map<string, number>
): Phrase[] {
  const current = reinsertCount.get(phrase.id) ?? 0;
  if (current >= MAX_REINSERT_PER_PHRASE) return queue;
  const insertAt = Math.min(cursor + K_HARD_REINSERT, queue.length);
  const next = queue.slice();
  next.splice(insertAt, 0, phrase);
  reinsertCount.set(phrase.id, current + 1);
  return next;
}

// ─── Progress mutations ──────────────────────────────────────────────────────

const RATING_DELTA: Record<PhraseRating, number> = { easy: -1, ok: 0, hard: +1 };

/**
 * Registra la calificación del usuario para una frase:
 *  - easy → rating -= 1
 *  - ok   → rating no cambia (pero sí seenCount, lastRating, lastSeenAt)
 *  - hard → rating += 1
 */
export async function ratePhraseInDb(
  phraseId: string,
  _levelId: string,
  rating: PhraseRating
): Promise<void> {
  const prev = getPhraseProgressFromStore()[phraseId];
  const prevRating = prev?.rating ?? 0;
  const prevSeen = prev?.seenCount ?? 0;
  setPhraseProgressEntry(phraseId, {
    rating: prevRating + RATING_DELTA[rating],
    seenCount: prevSeen + 1,
    lastRating: rating,
    lastSeenAt: Date.now(),
  });
  await saveProgress();
}

export async function completeLevel(
  levelId: string,
  sessionListens = 0,
  sessionTimeSeconds = 0
): Promise<void> {
  const prev = getLevelProgressFromStore()[levelId];
  setLevelProgressEntry(levelId, {
    completedSessions: (prev?.completedSessions ?? 0) + 1,
    lastPlayedAt: new Date().toISOString(),
    totalListens: (prev?.totalListens ?? 0) + sessionListens,
    totalTimeSeconds: (prev?.totalTimeSeconds ?? 0) + sessionTimeSeconds,
  });
  await saveProgress();
}

export function getLevelStats(levelId: string): LevelStats {
  const allPhrases = getPhrasesFromStore().filter(p => p.level_id === levelId);
  const lp = getLevelProgressFromStore()[levelId];
  return {
    masteredCount: computeMasteredCount(allPhrases.map(p => p.id)),
    totalPhrases: allPhrases.length,
    totalListens: lp?.totalListens ?? 0,
    totalTimeSeconds: lp?.totalTimeSeconds ?? 0,
  };
}

export async function resetLevelProgress(levelId: string): Promise<void> {
  const phrases = getPhrasesFromStore().filter(p => p.level_id === levelId);
  for (const phrase of phrases) {
    setPhraseProgressEntry(phrase.id, {
      rating: 0,
      seenCount: 0,
      lastRating: null,
      lastSeenAt: null,
    });
  }
  await saveProgress();
}

export async function getPhraseProgressForLevel(levelId: string): Promise<PhraseProgress[]> {
  const phraseProgress = getPhraseProgressFromStore();
  const phrases = getPhrasesFromStore().filter(p => p.level_id === levelId);
  return phrases.map(p => {
    const prog: PhraseProg | undefined = phraseProgress[p.id];
    return {
      phrase_id: p.id,
      level_id: levelId,
      rating: prog?.rating ?? 0,
      seen_count: prog?.seenCount ?? 0,
      last_rating: prog?.lastRating ?? null,
      last_seen_at: prog?.lastSeenAt ?? null,
    };
  });
}

// ─── Downloaded level helpers ────────────────────────────────────────────────

export async function deleteLevel(levelId: string): Promise<void> {
  deleteLevelFromStore(levelId);
  await saveProgress();
}
