/**
 * Tests para el controller de sesión (src/db/session.ts).
 *
 * Cubre la orquestación completa del flujo de sesión: construir cola, avanzar,
 * reinsertar en hard con cap, persistir ratings, navegar atrás, terminar sesión,
 * repetir vs resetear, pausar/reanudar timer. Complementa los tests de primitivas
 * en `session.test.ts`, que cubren `queries.ts` a nivel unitario.
 */

const META_TEST: Record<string, any> = {
  id: 'test-basic-1',
  topicId: 'test',
  title: 'Test Basic 1',
  difficulty: 'A1',
  dateAdded: '2024-01-01',
  source: 'bundled',
  schemaVersion: 1,
  updatedAt: '2026-01-01T00:00:00',
};

const TWO_PHRASES = [
  { spanish: 'Uno', english: 'One' },
  { spanish: 'Dos', english: 'Two' },
];

const THREE_PHRASES = [
  { spanish: 'Uno', english: 'One' },
  { spanish: 'Dos', english: 'Two' },
  { spanish: 'Tres', english: 'Three' },
];

const FOUR_PHRASES = [
  { spanish: 'Uno', english: 'One' },
  { spanish: 'Dos', english: 'Two' },
  { spanish: 'Tres', english: 'Three' },
  { spanish: 'Cuatro', english: 'Four' },
];

const FIVE_PHRASES = [
  { spanish: 'Uno', english: 'One' },
  { spanish: 'Dos', english: 'Two' },
  { spanish: 'Tres', english: 'Three' },
  { spanish: 'Cuatro', english: 'Four' },
  { spanish: 'Cinco', english: 'Five' },
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
  jest.restoreAllMocks();
});

// ─── 1. Sesión feliz — todo OK ───────────────────────────────────────────────

describe('createSession — sesión feliz', () => {
  test('avanza cursor frase a frase y finish() persiste completedSessions', async () => {
    seedLevel(META_TEST, FIVE_PHRASES);
    const { scanInstalledLevels, getPhraseProgressFromStore, getLevelProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1');

    expect(s.size()).toBe(5);
    expect(s.position()).toBe(0);
    expect(s.isFinished()).toBe(false);
    expect(s.current()).toBeDefined();

    let steps = 0;
    while (!s.isFinished() && steps < 20) {
      expect(s.position()).toBe(steps);
      await s.rate('ok');
      steps++;
    }

    expect(steps).toBe(5);
    expect(s.isFinished()).toBe(true);
    expect(s.current()).toBeUndefined();

    const stats = await s.finish();
    expect(getLevelProgressFromStore()['test-basic-1'].completedSessions).toBe(1);

    const prog = getPhraseProgressFromStore();
    for (let i = 1; i <= 5; i++) {
      const p = prog[`test-basic-1-${i}`];
      expect(p.seenCount).toBe(1);
      expect(p.lastRating).toBe('ok');
      expect(p.rating).toBe(0);
    }
    // Umbral relativo: todos iguales → nadie domina.
    expect(stats.masteredCount).toBe(0);
    expect(stats.totalPhrases).toBe(5);
  });
});

// ─── 2. Reinserción hard + cap durante sesión completa ──────────────────────

describe('createSession — reinserción hard con cap anti-loop', () => {
  test('una frase marcada hard siempre termina la sesión en tiempo finito (cap=3)', async () => {
    seedLevel(META_TEST, FIVE_PHRASES);
    const { scanInstalledLevels, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1');

    // Marcar siempre hard sobre la frase actual. Con cap=3 reinserciones
    // por frase, la cola NO puede crecer infinitamente. Máx teórico:
    // 5 originales + 5*3 reinserciones = 20. Usamos 50 como límite de seguridad.
    let steps = 0;
    const MAX_STEPS = 50;
    while (!s.isFinished() && steps < MAX_STEPS) {
      await s.rate('hard');
      steps++;
    }

    expect(s.isFinished()).toBe(true);
    expect(steps).toBeLessThan(MAX_STEPS);
    // La cola no puede exceder originales + 5*3 reinserciones.
    expect(s.size()).toBeLessThanOrEqual(5 + 5 * 3);

    // Cada frase debería tener rating >= 1 (al menos se calificó una vez como hard).
    const prog = getPhraseProgressFromStore();
    for (let i = 1; i <= 5; i++) {
      const p = prog[`test-basic-1-${i}`];
      expect(p.rating).toBeGreaterThanOrEqual(1);
      expect(p.lastRating).toBe('hard');
    }
  });

  test('cap=3 se respeta por frase: no más de 3 reinserciones sobre la misma', async () => {
    seedLevel(META_TEST, FIVE_PHRASES);
    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1');

    const initialSize = s.size();

    // Forzar que la primera frase se califique hard hasta alcanzar el cap.
    // Como el cursor siempre avanza, tras cada hard volvemos con back.
    // Pero back no retrocede antes del 0, por lo que tras rate() cursor=1,
    // back() → cursor=0 (misma frase) y podemos repetir.
    const firstPhraseId = s.current().id;
    for (let i = 0; i < 10; i++) {
      if (s.current().id !== firstPhraseId) break;
      await s.rate('hard');
      s.back();
    }

    // Tras 3 reinserciones efectivas, subsequent 'hard' NO crecen la cola.
    // initialSize + 3 reinserciones = initialSize + 3.
    expect(s.size()).toBe(initialSize + 3);
  });
});

// ─── 3. Navegación atrás ─────────────────────────────────────────────────────

describe('createSession — back()', () => {
  test('back() no deshace el rating persistido; cursor vuelve a la frase anterior', async () => {
    seedLevel(META_TEST, THREE_PHRASES);
    const { scanInstalledLevels, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1');

    const firstId = s.current().id;
    await s.rate('easy'); // cursor=1
    expect(s.position()).toBe(1);

    const secondId = s.current().id;
    await s.rate('ok'); // cursor=2
    expect(s.position()).toBe(2);

    s.back(); // cursor=1
    expect(s.position()).toBe(1);
    expect(s.current().id).toBe(secondId);

    // rating[second] sigue siendo 0 (ok no cambia rating), pero seenCount=1.
    const progBefore = getPhraseProgressFromStore();
    expect(progBefore[secondId].rating).toBe(0);
    expect(progBefore[secondId].seenCount).toBe(1);

    // Re-calificar como hard
    await s.rate('hard');
    const progAfter = getPhraseProgressFromStore();
    expect(progAfter[secondId].rating).toBe(1);
    expect(progAfter[secondId].seenCount).toBe(2);
    expect(s.position()).toBe(2);

    // Y el rating de la primera frase sigue intacto.
    expect(progAfter[firstId].rating).toBe(-1);
    expect(progAfter[firstId].lastRating).toBe('easy');
  });

  test('back() en cursor=0 es no-op', async () => {
    seedLevel(META_TEST, THREE_PHRASES);
    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1');
    expect(s.position()).toBe(0);
    s.back();
    s.back();
    s.back();
    expect(s.position()).toBe(0);
  });
});

// ─── 4. Persistencia entre sesiones ──────────────────────────────────────────

describe('createSession — persistencia entre sesiones', () => {
  test('una frase con rating alto aparece antes en la 2ª sesión con mayor frecuencia', async () => {
    seedLevel(META_TEST, FIVE_PHRASES);
    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    // Simular que la frase 3 quedó marcada hard varias veces en sesiones previas.
    setPhraseProgressEntry('test-basic-1-3', {
      rating: 5,
      seenCount: 5,
      lastRating: 'hard',
      lastSeenAt: 1,
    });

    const { createSession } = require('../src/db/session');

    let topTwoHits = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const s = createSession('test-basic-1');
      const firstId = s.current().id;
      s.rate('ok'); // solo para consumir, no afecta el test
      // Reseteamos el rating de la frase 3 NO — queremos que persista.
      // Pero no llamamos finish (no inflamos completedSessions); creamos otra.
      // Problema: ratePhraseInDb cambió el seenCount de otras frases.
      // Nos basta con mirar la PRIMERA frase de la cola recién construida,
      // lo cual se observa antes de llamar rate().
      if (firstId === 'test-basic-1-3') topTwoHits++;
      else {
        // Chequear top-2
        // No tenemos acceso al segundo elemento directamente sin avanzar, pero
        // podemos crear otra sesión (sin finish) — buildSessionQueue es idempotente
        // sobre el store, así que mirar el segundo elemento vía un controller
        // secundario no es necesario. Simplificamos: contamos solo el top-1.
      }
    }

    // La frase con rating=5 (mean cerca de 1) tiene peso ~exp(0.8*4) ≈ 24.5
    // frente a ~1 para las otras. Esperamos > 50% de veces en top-1.
    expect(topTwoHits / N).toBeGreaterThan(0.5);
  });

  test('ratings persistidos de una sesión real se usan en buildSessionQueue de la siguiente', async () => {
    seedLevel(META_TEST, THREE_PHRASES);
    const { scanInstalledLevels, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { createSession } = require('../src/db/session');

    // Sesión 1: marcar todas las frases como easy.
    const s1 = createSession('test-basic-1');
    while (!s1.isFinished()) await s1.rate('easy');
    await s1.finish();

    // Verificar que el progreso se persistió.
    const prog = getPhraseProgressFromStore();
    for (let i = 1; i <= 3; i++) {
      expect(prog[`test-basic-1-${i}`].rating).toBe(-1);
      expect(prog[`test-basic-1-${i}`].lastRating).toBe('easy');
    }

    // Sesión 2: nueva cola. Con todos los ratings iguales (-1), la
    // normalización produce pesos uniformes (constraint relativo).
    const s2 = createSession('test-basic-1');
    expect(s2.size()).toBe(3);

    // Al rate('hard') en s2, debe SUMAR al rating de -1 → 0.
    await s2.rate('hard');
    const firstId = s2.current() ? null : 'test-basic-1-1'; // ignorable
    const progAfter = getPhraseProgressFromStore();
    const anyHard = Object.values(progAfter).find((p: any) => p.rating === 0 && p.lastRating === 'hard');
    expect(anyHard).toBeDefined();
  });
});

// ─── 5. Fin de sesión → stats y completedSessions ────────────────────────────

describe('createSession — finish() y stats', () => {
  test('listens y tiempo acumulado se reportan en stats; finish() es idempotente', async () => {
    seedLevel(META_TEST, FOUR_PHRASES);
    const { scanInstalledLevels, getLevelProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const fake = { value: 1000 };
    const now = () => fake.value;

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1', { now });

    // Simular 4 frases: cada una toma 4 segundos y 1 escucha.
    for (let i = 0; i < 4; i++) {
      fake.value += 4000;
      s.listen();
      await s.rate('easy');
    }

    expect(s.isFinished()).toBe(true);
    const stats = await s.finish();

    expect(stats.totalListens).toBe(4);
    // 4 * 4000ms = 16000ms = 16s
    expect(stats.totalTimeSeconds).toBe(16);

    const lp = getLevelProgressFromStore()['test-basic-1'];
    expect(lp.completedSessions).toBe(1);
    expect(lp.totalListens).toBe(4);
    expect(lp.totalTimeSeconds).toBe(16);

    // Llamar finish de nuevo: idempotente, no vuelve a incrementar.
    fake.value += 100000;
    const stats2 = await s.finish();
    expect(getLevelProgressFromStore()['test-basic-1'].completedSessions).toBe(1);
    expect(stats2.totalListens).toBe(4);
    expect(stats2.totalTimeSeconds).toBe(16);
  });
});

// ─── 6. repeat() vs resetAndRepeat() ─────────────────────────────────────────

describe('createSession — repeat vs resetAndRepeat', () => {
  test('repeat() conserva ratings persistidos; resetAndRepeat() los borra', async () => {
    seedLevel(META_TEST, THREE_PHRASES);
    const { scanInstalledLevels, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1');

    // Marcar todas easy (no hay reinserciones, rating baja a -1 cada una).
    while (!s.isFinished()) await s.rate('easy');
    await s.finish();

    let prog = getPhraseProgressFromStore();
    for (let i = 1; i <= 3; i++) {
      expect(prog[`test-basic-1-${i}`].rating).toBe(-1);
      expect(prog[`test-basic-1-${i}`].lastRating).toBe('easy');
    }

    // repeat(): reconstruye cola SIN resetear ratings.
    s.repeat();
    expect(s.position()).toBe(0);
    expect(s.size()).toBe(3);
    expect(s.isFinished()).toBe(false);

    prog = getPhraseProgressFromStore();
    for (let i = 1; i <= 3; i++) {
      expect(prog[`test-basic-1-${i}`].rating).toBe(-1);
      expect(prog[`test-basic-1-${i}`].lastRating).toBe('easy');
    }

    // Segunda pasada: marcar todas easy otra vez. Ratings: -1 - 1 = -2.
    while (!s.isFinished()) await s.rate('easy');
    prog = getPhraseProgressFromStore();
    for (let i = 1; i <= 3; i++) {
      expect(prog[`test-basic-1-${i}`].rating).toBe(-2);
    }

    // resetAndRepeat(): resetea progreso.
    await s.resetAndRepeat();
    expect(s.position()).toBe(0);
    expect(s.size()).toBe(3);

    prog = getPhraseProgressFromStore();
    for (let i = 1; i <= 3; i++) {
      expect(prog[`test-basic-1-${i}`]).toEqual({
        rating: 0,
        seenCount: 0,
        lastRating: null,
        lastSeenAt: null,
      });
    }
  });
});

// ─── 7. Pause/resume del timer ───────────────────────────────────────────────

describe('createSession — pause/resume del timer', () => {
  test('tiempo en background no cuenta', async () => {
    seedLevel(META_TEST, TWO_PHRASES);
    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const fake = { value: 1000 };
    const now = () => fake.value;

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1', { now });
    // t=1000 → segmentStart

    fake.value = 5000;         // +4s activos
    s.pause();                 // activeMs=4000, segmentStart=null

    fake.value = 10000;        // +5s en background (no cuenta)
    s.resume();                // segmentStart=10000

    fake.value = 12000;        // +2s activos (total 6s)
    await s.rate('easy');
    await s.rate('easy');
    const stats = await s.finish();

    expect(stats.totalTimeSeconds).toBe(6);
  });

  test('pause() sin resume() sigue siendo idempotente', async () => {
    seedLevel(META_TEST, TWO_PHRASES);
    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const fake = { value: 0 };
    const now = () => fake.value;

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1', { now });

    fake.value = 3000;
    s.pause();
    fake.value = 10000;
    s.pause(); // no-op, ya pausado
    fake.value = 20000;

    await s.rate('ok');
    await s.rate('ok');
    const stats = await s.finish();

    // Solo los 3 segundos iniciales cuentan.
    expect(stats.totalTimeSeconds).toBe(3);
  });
});

// ─── 8. Smoke: la cola siempre avanza ────────────────────────────────────────

describe('createSession — smoke anti-loop', () => {
  test('2 frases marcadas hard repetidamente terminan la sesión en tiempo finito', async () => {
    seedLevel(META_TEST, TWO_PHRASES);
    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { createSession } = require('../src/db/session');
    const s = createSession('test-basic-1');

    let steps = 0;
    const MAX = 30;
    while (!s.isFinished() && steps < MAX) {
      await s.rate('hard');
      steps++;
    }

    expect(s.isFinished()).toBe(true);
    expect(steps).toBeLessThan(MAX);
    // Cap teórico: 2 originales + 2*3 reinserciones = 8.
    expect(s.size()).toBeLessThanOrEqual(8);
  });
});
