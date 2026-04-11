/**
 * Session controller — orquesta una sesión de estudio de un nivel.
 *
 * Encapsula la cola, el cursor, el mapa de reinserciones hard (con cap),
 * los contadores de sesión (listens) y el timer de tiempo activo. `PlayScreen`
 * se limita a conectar esta factory con la UI (audio, gestos, AppState).
 *
 * Factoría pura con estado en closure: trivialmente testable sin renderizar
 * React. Inyecta `now` para tests deterministas del timer.
 */

import {
  buildSessionQueue,
  reinsertHard,
  ratePhraseInDb,
  completeLevel,
  getLevelStats,
  resetLevelProgress,
  LevelStats,
  Phrase,
  PhraseRating,
} from './queries';

export interface SessionController {
  /** Frase en la posición actual del cursor, o undefined si terminó. */
  current(): Phrase | undefined;
  /** cursor >= queue.length */
  isFinished(): boolean;
  /** Posición (0-based) del cursor, para la barra de progreso. */
  position(): number;
  /** Longitud actual de la cola (crece con reinserciones hard). */
  size(): number;
  /**
   * Califica la frase actual. En 'hard' reinserta con cap anti-loop.
   * Persiste el rating inmediatamente. Avanza el cursor.
   */
  rate(rating: PhraseRating): Promise<void>;
  /** Retrocede una posición sin tocar ratings. No-op en cursor=0. */
  back(): void;
  /** Contabiliza una reproducción de audio (para stats de sesión). */
  listen(): void;
  /** Pausa el timer de tiempo activo (p.ej. app en background). */
  pause(): void;
  /** Reanuda el timer. No-op si ya está corriendo. */
  resume(): void;
  /**
   * Finaliza la sesión: llama `completeLevel(levelId, listens, secs)` y
   * devuelve stats actualizadas. Idempotente: segura de llamar varias veces.
   */
  finish(): Promise<LevelStats>;
  /**
   * Reconstruye la cola con los ratings actuales (NO resetea progreso).
   * Resetea cursor, reinsertCount, listens y timer.
   */
  repeat(): void;
  /**
   * Resetea el progreso del nivel y reconstruye la cola desde cero.
   */
  resetAndRepeat(): Promise<void>;
}

export interface CreateSessionOptions {
  /** Inyectable para tests deterministas. Default: Date.now. */
  now?: () => number;
}

export function createSession(
  levelId: string,
  options?: CreateSessionOptions
): SessionController {
  const now = options?.now ?? Date.now;

  let queue: Phrase[] = buildSessionQueue(levelId);
  let cursor = 0;
  let reinsertCount = new Map<string, number>();
  let listens = 0;
  let activeMs = 0;
  let segmentStart: number | null = now();
  let finished = false;

  function pauseTimer() {
    if (segmentStart != null) {
      activeMs += now() - segmentStart;
      segmentStart = null;
    }
  }

  function resumeTimer() {
    if (segmentStart == null) segmentStart = now();
  }

  const controller: SessionController = {
    current: () => queue[cursor],
    isFinished: () => cursor >= queue.length,
    position: () => cursor,
    size: () => queue.length,

    async rate(rating) {
      const phrase = queue[cursor];
      if (!phrase) return;
      await ratePhraseInDb(phrase.id, levelId, rating);
      if (rating === 'hard') {
        queue = reinsertHard(queue, cursor, phrase, reinsertCount);
      }
      cursor += 1;
    },

    back() {
      if (cursor > 0) cursor -= 1;
    },

    listen() {
      listens += 1;
    },

    pause: pauseTimer,
    resume: resumeTimer,

    async finish() {
      if (!finished) {
        finished = true;
        pauseTimer();
        await completeLevel(levelId, listens, Math.round(activeMs / 1000));
      }
      return getLevelStats(levelId);
    },

    repeat() {
      queue = buildSessionQueue(levelId);
      cursor = 0;
      reinsertCount = new Map();
      listens = 0;
      activeMs = 0;
      segmentStart = now();
      finished = false;
    },

    async resetAndRepeat() {
      await resetLevelProgress(levelId);
      controller.repeat();
    },
  };

  return controller;
}
