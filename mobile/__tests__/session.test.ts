/**
 * Tests para el sistema de rating ponderado relativo:
 *
 *  - ratePhraseInDb (easy/ok/hard → rating, seenCount, lastRating, lastSeenAt)
 *  - buildSessionQueue (weighted shuffle Efraimidis–Spirakis)
 *  - reinsertHard (reinserción con cap anti-loop)
 *  - getNextLevelId (siguiente nivel respetando difficultyFilter)
 *  - loadProgress: migración desde el esquema antiguo { learned: boolean }
 *
 * El constraint crítico que se verifica en varios tests: si el usuario marca
 * todo igual (todo fácil o todo difícil), el sistema NO debe producir efecto
 * en la ordenación (`rating_i - mean = 0` para todas las frases).
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

const META_TEST: Record<string, any> = {
  id: 'test-basic-1',
  topicId: 'test',
  title: 'Test Basic 1',
  difficulty: 'A1',
  dateAdded: '2024-01-01',
  source: 'bundled',
};

const META_INTERM: Record<string, any> = {
  id: 'test-interm-1',
  topicId: 'test',
  title: 'Test Interm 1',
  difficulty: 'A2',
  dateAdded: '2024-02-01',
  source: 'bundled',
};

const META_ADV: Record<string, any> = {
  id: 'test-adv-1',
  topicId: 'test',
  title: 'Test Adv 1',
  difficulty: 'B1',
  dateAdded: '2024-03-01',
  source: 'bundled',
};

const FIVE_PHRASES = [
  { spanish: 'Uno', english: 'One' },
  { spanish: 'Dos', english: 'Two' },
  { spanish: 'Tres', english: 'Three' },
  { spanish: 'Cuatro', english: 'Four' },
  { spanish: 'Cinco', english: 'Five' },
];

const TWO_PHRASES = [
  { spanish: 'Hola', english: 'Hello' },
  { spanish: 'Adiós', english: 'Goodbye' },
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

// ─── ratePhraseInDb ──────────────────────────────────────────────────────────

describe('ratePhraseInDb', () => {
  test("'easy' decrementa rating en 1 y marca lastRating", async () => {
    seedLevel(META_TEST, TWO_PHRASES);
    const { scanInstalledLevels, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { ratePhraseInDb } = require('../src/db/queries');
    const before = Date.now();
    await ratePhraseInDb('test-basic-1-1', 'test-basic-1', 'easy');

    const prog = getPhraseProgressFromStore()['test-basic-1-1'];
    expect(prog.rating).toBe(-1);
    expect(prog.seenCount).toBe(1);
    expect(prog.lastRating).toBe('easy');
    expect(prog.lastSeenAt).toBeGreaterThanOrEqual(before);
  });

  test("'hard' incrementa rating en 1", async () => {
    seedLevel(META_TEST, TWO_PHRASES);
    const { scanInstalledLevels, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { ratePhraseInDb } = require('../src/db/queries');
    await ratePhraseInDb('test-basic-1-1', 'test-basic-1', 'hard');

    const prog = getPhraseProgressFromStore()['test-basic-1-1'];
    expect(prog.rating).toBe(1);
    expect(prog.lastRating).toBe('hard');
  });

  test("'ok' no cambia rating pero incrementa seenCount", async () => {
    seedLevel(META_TEST, TWO_PHRASES);
    const { scanInstalledLevels, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { ratePhraseInDb } = require('../src/db/queries');
    await ratePhraseInDb('test-basic-1-1', 'test-basic-1', 'ok');
    await ratePhraseInDb('test-basic-1-1', 'test-basic-1', 'ok');

    const prog = getPhraseProgressFromStore()['test-basic-1-1'];
    expect(prog.rating).toBe(0);
    expect(prog.seenCount).toBe(2);
    expect(prog.lastRating).toBe('ok');
  });

  test('persiste el progreso a AsyncStorage', async () => {
    seedLevel(META_TEST, TWO_PHRASES);
    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const { ratePhraseInDb } = require('../src/db/queries');
    await ratePhraseInDb('test-basic-1-1', 'test-basic-1', 'hard');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('progress', expect.any(String));
  });
});

// ─── buildSessionQueue: constraint de normalización ──────────────────────────

describe('buildSessionQueue — constraint de normalización', () => {
  test('con todos los ratings iguales (todo fácil) los pesos son uniformes', async () => {
    seedLevel(META_TEST, FIVE_PHRASES);
    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    // Marcar todas con el mismo rating negativo (equivalente a "todo fácil"
    // aplicado N veces). Si el sistema fuera absoluto, todas saldrían al
    // final; pero la normalización relativa produce pesos uniformes.
    for (let i = 1; i <= 5; i++) {
      setPhraseProgressEntry(`test-basic-1-${i}`, {
        rating: -3,
        seenCount: 3,
        lastRating: 'easy',
        lastSeenAt: 1,
      });
    }

    // Math.random determinista: secuencia ascendente 0.1, 0.2, 0.3, 0.4, 0.5.
    // Con pesos iguales (w=1), key_i = U^(1/1) = U. Ordenados DESC → orden
    // inverso de la secuencia de Math.random → [frase5, frase4, frase3, frase2, frase1].
    const randoms = [0.1, 0.2, 0.3, 0.4, 0.5];
    let idx = 0;
    jest.spyOn(Math, 'random').mockImplementation(() => randoms[idx++]);

    const { buildSessionQueue } = require('../src/db/queries');
    const queue = buildSessionQueue('test-basic-1');

    expect(queue.map((p: any) => p.id)).toEqual([
      'test-basic-1-5',
      'test-basic-1-4',
      'test-basic-1-3',
      'test-basic-1-2',
      'test-basic-1-1',
    ]);
  });

  test('con todos los ratings iguales (todo difícil) el mismo orden que con todos a 0', async () => {
    seedLevel(META_TEST, FIVE_PHRASES);
    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    for (let i = 1; i <= 5; i++) {
      setPhraseProgressEntry(`test-basic-1-${i}`, {
        rating: 5,
        seenCount: 5,
        lastRating: 'hard',
        lastSeenAt: 1,
      });
    }

    const randoms = [0.9, 0.1, 0.5, 0.3, 0.7];
    let idx = 0;
    jest.spyOn(Math, 'random').mockImplementation(() => randoms[idx++]);

    const { buildSessionQueue } = require('../src/db/queries');
    const queueHard = buildSessionQueue('test-basic-1');

    // Reset stubs y comparar con todos a rating 0 usando la MISMA secuencia.
    for (let i = 1; i <= 5; i++) {
      setPhraseProgressEntry(`test-basic-1-${i}`, {
        rating: 0,
        seenCount: 0,
        lastRating: null,
        lastSeenAt: null,
      });
    }
    idx = 0;
    const queueZero = buildSessionQueue('test-basic-1');

    expect(queueHard.map((p: any) => p.id)).toEqual(queueZero.map((p: any) => p.id));
  });
});

// ─── buildSessionQueue: efecto relativo ──────────────────────────────────────

describe('buildSessionQueue — efecto relativo', () => {
  test('una frase con rating más alto (más difícil) aparece antes con mayor frecuencia', async () => {
    seedLevel(META_TEST, FIVE_PHRASES);
    const { scanInstalledLevels, setPhraseProgressEntry } = require('../src/store/appStore');
    await scanInstalledLevels();

    // Frase 3 marcada como "muy difícil" (rating alto), resto a 0.
    setPhraseProgressEntry('test-basic-1-3', {
      rating: 5,
      seenCount: 5,
      lastRating: 'hard',
      lastSeenAt: 1,
    });

    // Sampling real (sin mock) sobre 500 iteraciones; contar cuántas veces la
    // frase 3 aparece entre las dos primeras posiciones de la cola.
    const { buildSessionQueue } = require('../src/db/queries');
    let topTwoHits = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      const q = buildSessionQueue('test-basic-1');
      if (q[0].id === 'test-basic-1-3' || q[1].id === 'test-basic-1-3') topTwoHits++;
    }
    // Si todo fuera uniforme, esperaríamos ≈ 40% (2/5). Con rating muy alto
    // debería ser mucho más. Exigimos al menos 70% para margen estadístico.
    expect(topTwoHits / N).toBeGreaterThan(0.7);
  });
});

// ─── reinsertHard ────────────────────────────────────────────────────────────

describe('reinsertHard', () => {
  test('reinserta la frase en cursor + K_HARD_REINSERT', () => {
    const { reinsertHard, K_HARD_REINSERT } = require('../src/db/queries');
    expect(K_HARD_REINSERT).toBe(4);

    const queue = [
      { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' },
    ];
    const reinsertCount = new Map();
    const next = reinsertHard(queue, 0, queue[0], reinsertCount);
    // cursor=0, offset=4 → splice en posición 4 → [a,b,c,d,a,e]
    expect(next.map((p: any) => p.id)).toEqual(['a', 'b', 'c', 'd', 'a', 'e']);
    expect(reinsertCount.get('a')).toBe(1);
  });

  test('cuando cursor + K excede la longitud, inserta al final', () => {
    const { reinsertHard } = require('../src/db/queries');
    const queue = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const reinsertCount = new Map();
    const next = reinsertHard(queue, 2, queue[2], reinsertCount);
    // cursor=2, offset=4 → posición 6 → truncada a length=3 → al final
    expect(next.map((p: any) => p.id)).toEqual(['a', 'b', 'c', 'c']);
  });

  test('cap anti-loop: no reinserta más allá de MAX_REINSERT_PER_PHRASE', () => {
    const { reinsertHard, MAX_REINSERT_PER_PHRASE } = require('../src/db/queries');
    expect(MAX_REINSERT_PER_PHRASE).toBe(3);

    let queue = [{ id: 'x' }, { id: 'y' }];
    const reinsertCount = new Map();
    for (let i = 0; i < 5; i++) {
      queue = reinsertHard(queue, 0, { id: 'x' }, reinsertCount);
    }
    // Solo 3 reinserciones efectivas
    expect(reinsertCount.get('x')).toBe(3);
    // 5 intentos pero solo 3 añadidos: longitud = 2 + 3
    expect(queue.length).toBe(5);
  });
});

// ─── getNextLevelId ──────────────────────────────────────────────────────────

describe('getNextLevelId', () => {
  test('sin filtro: devuelve el siguiente alfabéticamente dentro del topic', async () => {
    seedLevel(META_TEST, TWO_PHRASES);    // test-basic-1
    seedLevel(META_INTERM, TWO_PHRASES);  // test-interm-1
    seedLevel(META_ADV, TWO_PHRASES);     // test-adv-1

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getNextLevelId } = require('../src/db/queries');
    // Orden alfabético por id: adv-1, basic-1, interm-1
    expect(await getNextLevelId('test-adv-1', 'test', '')).toBe('test-basic-1');
    expect(await getNextLevelId('test-basic-1', 'test', '')).toBe('test-interm-1');
    expect(await getNextLevelId('test-interm-1', 'test', '')).toBe(null);
  });

  test('con difficultyFilter=A1 solo navega entre A1', async () => {
    seedLevel(META_TEST, TWO_PHRASES);    // A1
    seedLevel(META_INTERM, TWO_PHRASES);  // A2

    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getNextLevelId } = require('../src/db/queries');
    // Solo hay un A1 → no hay siguiente
    expect(await getNextLevelId('test-basic-1', 'test', 'A1')).toBe(null);
  });

  test('devuelve null si el nivel actual no existe en la lista filtrada', async () => {
    seedLevel(META_TEST, TWO_PHRASES);
    const { scanInstalledLevels } = require('../src/store/appStore');
    await scanInstalledLevels();

    const { getNextLevelId } = require('../src/db/queries');
    expect(await getNextLevelId('nope', 'test', '')).toBe(null);
  });
});

// ─── Migración desde el esquema legacy ───────────────────────────────────────

describe('loadProgress — migración desde esquema legacy', () => {
  test('convierte { learned:true, seenCount } → { rating:-3, lastRating:"easy" }', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const legacy = {
      phraseProgress: {
        'x-1': { learned: true, seenCount: 5 },
        'x-2': { learned: false, seenCount: 2 },
      },
      levelProgress: {},
    };
    await AsyncStorage.setItem('progress', JSON.stringify(legacy));

    const { loadProgress, getPhraseProgressFromStore } = require('../src/store/appStore');
    await loadProgress();

    const p1 = getPhraseProgressFromStore()['x-1'];
    const p2 = getPhraseProgressFromStore()['x-2'];

    expect(p1).toEqual({
      rating: -3,
      seenCount: 5,
      lastRating: 'easy',
      lastSeenAt: null,
    });
    expect(p2).toEqual({
      rating: 0,
      seenCount: 2,
      lastRating: null,
      lastSeenAt: null,
    });
  });

  test('persiste la migración: tras loadProgress, saveProgress fue llamado', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const legacy = {
      phraseProgress: { 'x-1': { learned: true, seenCount: 1 } },
      levelProgress: {},
    };
    await AsyncStorage.setItem('progress', JSON.stringify(legacy));
    AsyncStorage.setItem.mockClear();

    const { loadProgress } = require('../src/store/appStore');
    await loadProgress();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('progress', expect.any(String));
    // Verificar que el contenido guardado ya no tiene `learned`
    const lastCall = AsyncStorage.setItem.mock.calls.at(-1);
    const saved = JSON.parse(lastCall[1]);
    expect(saved.phraseProgress['x-1'].learned).toBeUndefined();
    expect(saved.phraseProgress['x-1'].rating).toBe(-3);
  });

  test('install fresco (AsyncStorage vacío) no lanza ni persiste nada', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.setItem.mockClear();

    const { loadProgress, getPhraseProgressFromStore } = require('../src/store/appStore');
    await expect(loadProgress()).resolves.toBeUndefined();

    expect(getPhraseProgressFromStore()).toEqual({});
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('esquema ya migrado: loadProgress no reejecuta la migración', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const modern = {
      phraseProgress: {
        'x-1': { rating: -1, seenCount: 3, lastRating: 'easy', lastSeenAt: 123 },
      },
      levelProgress: {},
    };
    await AsyncStorage.setItem('progress', JSON.stringify(modern));
    AsyncStorage.setItem.mockClear();

    const { loadProgress, getPhraseProgressFromStore } = require('../src/store/appStore');
    await loadProgress();

    expect(getPhraseProgressFromStore()['x-1']).toEqual({
      rating: -1,
      seenCount: 3,
      lastRating: 'easy',
      lastSeenAt: 123,
    });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

// ─── resetLevelProgress ──────────────────────────────────────────────────────

describe('resetLevelProgress', () => {
  test('resetea rating, seenCount, lastRating y lastSeenAt de todas las frases del nivel', async () => {
    seedLevel(META_TEST, FIVE_PHRASES);
    const { scanInstalledLevels, setPhraseProgressEntry, getPhraseProgressFromStore } = require('../src/store/appStore');
    await scanInstalledLevels();

    setPhraseProgressEntry('test-basic-1-1', { rating: -3, seenCount: 5, lastRating: 'easy', lastSeenAt: 100 });
    setPhraseProgressEntry('test-basic-1-2', { rating: 2, seenCount: 4, lastRating: 'hard', lastSeenAt: 200 });

    const { resetLevelProgress } = require('../src/db/queries');
    await resetLevelProgress('test-basic-1');

    const prog = getPhraseProgressFromStore();
    expect(prog['test-basic-1-1']).toEqual({ rating: 0, seenCount: 0, lastRating: null, lastSeenAt: null });
    expect(prog['test-basic-1-2']).toEqual({ rating: 0, seenCount: 0, lastRating: null, lastSeenAt: null });
  });
});
