# LinguaTrainer — Especificaciones completas

App iOS para entrenar frases en inglés mediante tarjetas. Muestra la frase en español, el usuario escucha el audio, revela la traducción y la califica como **Fácil / OK / Difícil**. El sistema reordena las frases de la sesión según un rating ponderado relativo al promedio del nivel — las que cuestan aparecen antes y se repiten; las dominadas aparecen al final. Sin login, sin servidor, todo local.

---

## Estructura del repositorio

```
admin/                       Scripts Python de gestión de contenido
├── new_level.py             Crea un level de forma interactiva (questionary + claude)
├── generate_audio.py        Genera MP3 de un level desde phrases.json
├── sync_mobile.py           Empaqueta levels en ZIPs y actualiza BUNDLED_ZIPS
├── validate_levels.py       Valida integridad admin/levels vs mobile/assets/levels
├── practice.py              TUI de práctica en terminal (sin móvil)
├── requirements.txt         gtts, textual, rich, questionary
├── topics.json              Catálogo de topics (id, name, icon, color)
└── levels/                  Fuente de verdad de todo el contenido
    ├── greetings-A1-1/      Un level = una carpeta
    │   ├── meta.json        Metadatos del level (incluye topicId + CEFR)
    │   ├── phrases.json     Array JSON [{es, en, grammar_focus, tip}]
    │   └── audio/           MP3 generados: 001.mp3, 002.mp3...
    ├── greetings-B1-1/
    └── travel-A1-1/ travel-A2-1/ travel-B2-1/

mobile/                      App React Native + Expo
├── App.tsx                  Stack Navigator + boot sequence
├── assets/levels/           ZIPs bundleados (generados por sync_mobile.py)
└── src/
    ├── store/appStore.ts    Store en memoria + extracción ZIPs + BUNDLED_ZIPS
    ├── store/settingsStore  Zustand: themeMode, difficultyFilter, seenLevelIds, lastTopicId
    ├── db/queries.ts        Lecturas/mutaciones sobre el store + constantes de rating
    ├── db/session.ts        SessionController: cola + cursor + listens + timer pausable
    ├── theme/index.ts       Paletas solarizadas + useTheme()
    ├── hooks/useAudio.ts    Reproduce audio desde URI file://
    ├── utils/downloadLevel  Descarga e instala level ZIP desde URL
    ├── components/PhraseCard Card animada con gestos + ref imperativo
    └── screens/             TopicList, LevelList, Play, Settings
```

---

## Gestión de contenido (admin/)

### Convención de nombres de levels

El ID de un level sigue el formato: `<topicId>-<CEFR>-<número>`

- **`<topicId>`**: id exacto del topic en `admin/topics.json` (ej. `greetings`, `travel`, `restaurant`, `daily`). Puede contener guiones.
- **`<CEFR>`**: código CEFR exacto: `A1` | `A2` | `B1` | `B2` | `C1` | `C2`. Coincide con el campo `difficulty` de `meta.json`.
- **`<número>`**: orden dentro de la serie del mismo topic y dificultad (1, 2, 3...)

```
greetings-A1-1   → saludos, A1, level nº1
greetings-A1-2   → saludos, A1, level nº2  (continuación de la serie)
greetings-B1-1   → saludos, B1, level nº1
travel-B2-2      → viajes, B2, level nº2
```

El sufijo numérico es **orden de secuencia**. La dificultad va en el nombre y en el campo `difficulty` de `meta.json`. La ordenación en la app es alfabética por ID (`localeCompare`), por lo que `greetings-A1-1 < greetings-A2-1 < greetings-B1-1` — no hay `sort_order` explícito.

### Flujo completo para añadir un level nuevo

```bash
cd admin
source .venv/bin/activate    # o: python3 -m venv .venv && pip install -r requirements.txt

# 1. Crear el level de forma interactiva.
#    new_level.py pide topic (o crea uno nuevo llamando a `claude`), CEFR,
#    título, y genera N frases vía `claude -p` con el prompt parametrizado.
#    Escribe meta.json + phrases.json listos para usar.
python new_level.py

# 2. Generar audio
python generate_audio.py greetings-A1-2

# 3. Sincronizar con la app (empaqueta ZIPs en mobile/assets/levels/
#    + actualiza BUNDLED_ZIPS en src/store/appStore.ts)
python sync_mobile.py
#    --no-audio para empacar sin requerir MP3 (desarrollo)

# 4. Reiniciar la app — los nuevos ZIPs se extraen automáticamente.
#    No hace falta reinstalar: el progreso del usuario se conserva.
```

`new_level.py` requiere el binario `claude` (Claude Code CLI) en PATH — lo usa para sugerir icon/color al crear topics y para generar las frases con un prompt que respeta el nivel CEFR y el tema del level.

Los levels nuevos aparecen con badge **¡Nuevo!** en la app durante los 30 días siguientes a su `dateAdded` (si el usuario no los ha abierto todavía).

### Topics

Los topics se definen una sola vez en `admin/topics.json` como un array:

```json
[
  { "id": "daily",      "name": "Vida cotidiana", "icon": "chatbubbles-outline","color": "#cb4b16" },
  { "id": "greetings",  "name": "Saludos",        "icon": "hand-left-outline",  "color": "#268bd2" },
  { "id": "restaurant", "name": "Restaurante",    "icon": "restaurant-outline", "color": "#2aa198" },
  { "id": "travel",     "name": "Viajes",         "icon": "airplane-outline",   "color": "#859900" }
]
```

`icon` es un nombre de Ionicon (`@expo/vector-icons`). `sync_mobile.py` inyecta el topic correspondiente en cada ZIP de level como `topic.json`, de modo que la app no necesita `topics.json` en runtime. Los topics se ordenan alfabéticamente por nombre (`localeCompare('es')`).

Un topic declarado en `topics.json` que no tenga ningún level en `admin/levels/` **nunca aparece en la app**: `scanInstalledLevels()` sólo puebla `topics` leyendo el `topic.json` embebido en los ZIPs extraídos, así que sin levels no hay ZIPs y sin ZIPs no hay topic visible. Hoy `daily` y `restaurant` están en esta situación (ver `DOC_INCONSISTENCIES.md`).

### Formato de meta.json

```json
{
  "id": "greetings-A1-2",
  "topicId": "greetings",
  "title": "Saludos en el trabajo",
  "difficulty": "A1",
  "dateAdded": "2026-04-04"
}
```

- `id`: debe coincidir con el nombre del directorio.
- `topicId`: referencia a una entrada de `admin/topics.json`.
- `difficulty`: código CEFR — `A1` | `A2` | `B1` | `B2` | `C1` | `C2`.
- `dateAdded`: fecha ISO `YYYY-MM-DD`. Controla el badge "¡Nuevo!" (30 días).

### Formato de phrases.json

Array JSON con una entrada por frase:

```json
[
  {
    "es": "Hola",
    "en": "Hello",
    "grammar_focus": "",
    "tip": ""
  },
  {
    "es": "Ha estado lloviendo toda la mañana",
    "en": "It has been raining all morning",
    "grammar_focus": "presente perfecto continuo",
    "tip": "En inglés 'has been raining', no 'has rained'"
  }
]
```

- `es` / `en`: obligatorios.
- `grammar_focus` / `tip`: opcionales (cadena vacía = no se muestra nada en la ficha).
- `sync_mobile.py` convierte cada entrada a `{ spanish, english, grammar_focus, tip }` al escribirla dentro del ZIP — es lo que consume la app. No edites los ZIPs a mano.

### sync_mobile.py — qué genera

| Destino | Contenido |
|---|---|
| `mobile/assets/levels/{id}.zip` | ZIP con `meta.json` + `phrases.json` + `topic.json` + `audio/*.mp3` |
| `BUNDLED_ZIPS` en `src/store/appStore.ts` | Array de `require()` estáticos de los ZIPs |

Cada ZIP es autocontenido: lleva dentro los metadatos de su topic (extraídos de `admin/topics.json`). Solo se sincronizan levels que tienen la carpeta `audio/` con MP3s. Si falta audio, el level se salta con aviso.

### validate_levels.py

Verifica la integridad del contenido: que cada level en `admin/levels/` tenga un ZIP correspondiente en `mobile/assets/levels/`, que los phrases estén sincronizados, y que el ZIP esté registrado en `BUNDLED_ZIPS`. Ejecutar antes de dar por buena una sincronización.

### practice.py — herramienta de escritorio

```bash
python practice.py levels/greetings-A1-1/phrases.json
```

TUI en el terminal para practicar frases. Precede al móvil. El audio se genera y cachea en `admin/audio_cache/`.

---

## App móvil (mobile/)

### Stack tecnológico

| Librería | Versión | Uso |
|---|---|---|
| Expo SDK | ~54 | Base |
| React Native | 0.81 | UI |
| TypeScript | ~5.9 | Tipado |
| React Navigation | 7.x | Stack Navigator |
| Reanimated 3 | ~4.1 | Animaciones de cards |
| Gesture Handler | ~2.28 | Swipes |
| Expo AV | ~16 | Reproducción MP3 |
| expo-file-system/legacy | ~19 | Extracción de ZIPs, descarga de archivos |
| Zustand | — | Store de ajustes |
| AsyncStorage | — | Persistencia de progreso y ajustes |

**No hay SQLite.** El contenido vive como JSON en memoria y el progreso del usuario como JSON en AsyncStorage bajo la clave `'progress'`. (La dependencia `expo-sqlite` sigue en `package.json` pero no se importa en ningún sitio — ver `DOC_INCONSISTENCIES.md`.)

### Arquitectura de datos (sin base de datos)

El contenido se carga desde ZIPs extraídos al `documentDirectory`:

```
documentDirectory/levels/
├── greetings-A1-1/
│   ├── meta.json       { id, topicId, title, difficulty, dateAdded }
│   ├── phrases.json    [ { spanish, english, grammar_focus?, tip? }, ... ]
│   ├── topic.json      { id, name, icon, color }
│   └── audio/
│       ├── 001.mp3
│       └── 002.mp3
└── ...
```

**Boot sequence** (`App.tsx`):

```
loadProgress()           — AsyncStorage 'progress' → phraseProgress + levelProgress
  → loadSettings()       — themeMode, difficultyFilter, seenLevelIds, lastTopicId
  → extractBundledLevels() — Extrae assets/levels/*.zip → documentDirectory/levels/
  → scanInstalledLevels()  — Lee todos los directorios y puebla el store en memoria
```

`extractBundledLevels` es idempotente: si el directorio del level ya existe y contiene `topic.json`, lo salta. **Importante**: sólo comprueba existencia, no compara `dateAdded`, así que un ZIP bundleado actualizado con el mismo `id` **no se re-extrae** al reiniciar — el usuario ve el contenido viejo hasta que use "Borrar todos los datos" en Settings. Está documentado como bug en `DOC_INCONSISTENCIES.md`.

Los levels descargados se instalan en el mismo directorio, así que bundled y downloaded son **indistinguibles en runtime**.

**Tipos en memoria** (`src/store/appStore.ts`):

```
Topic       → id, name, icon, color
Level       → id, topic_id, title, difficulty, date_added, total_phrases, source
Phrase      → id, level_id, spanish, english, audio_path, sort_order
PhraseProg  → rating, seenCount, lastRating, lastSeenAt
LevelProg   → completedSessions, lastPlayedAt, totalListens, totalTimeSeconds
```

`audio_path` es siempre una URI absoluta `file://.../levels/{levelId}/audio/{NNN}.mp3`. **No existe** la convención antigua `bundled:{levelId}:{index}`.

### Persistencia del progreso

Todo el progreso vive en AsyncStorage bajo la clave `'progress'` como JSON:

```json
{
  "phraseProgress": {
    "greetings-A1-1-1": { "rating": -1, "seenCount": 3, "lastRating": "easy", "lastSeenAt": 1700000000000 }
  },
  "levelProgress": {
    "greetings-A1-1": { "completedSessions": 2, "lastPlayedAt": "2026-04-08T12:00:00.000Z", "totalListens": 15, "totalTimeSeconds": 240 }
  }
}
```

Los IDs de frase se construyen en `scanInstalledLevels` como `${levelId}-${sortOrder}` (1-based). `levelProgress` se indexa por `levelId`.

`saveProgress()` serializa ambos objetos tras cualquier mutación. `loadProgress()` detecta automáticamente el esquema legacy (`learned: boolean`) y lo migra (ver sección "Migración" más abajo).

### Navegación (Stack puro, sin Tab Navigator)

```
TopicListScreen  (pantalla inicial)
  ├─ [tap topic] → LevelListScreen { topicId }
  │                  └─ [tap level] → PlayScreen { levelId, levelTitle, topicId }
  │                                     └─ FinishedView (inline)
  └─ [⚙️] → SettingsScreen
```

`RootStackParamList` en `App.tsx`:

```ts
{
  TopicList: undefined;
  LevelList: { topicId: string };
  Play: { levelId: string; levelTitle: string; topicId: string };
  Settings: undefined;
}
```

La app arranca directamente en `TopicListScreen`. No hay HomeScreen activo (existe `src/screens/HomeScreen.tsx` en el repo pero no se importa en ningún sitio — ver `DOC_INCONSISTENCIES.md`).

### Filtro de dificultad

`difficultyFilter: '' | CEFRLevel` en `settingsStore`, persistido en AsyncStorage (`''` = todos). Se aplica en `getLevelsByTopic(topicId, difficultyFilter)` y se cambia directamente desde `LevelListScreen` con pills CEFR (A1/A2/B1/B2/C1/C2), que sólo se muestran para las dificultades con al menos un level en el topic. Toggle: pulsar el filtro activo lo deselecciona (= todos). **No está en Settings** — el usuario lo ajusta en contexto al elegir niveles. El `difficultyFilter` activo también determina cuál es el "siguiente nivel" al terminar una sesión.

Labels (`DIFFICULTY_LABELS` en `LevelListScreen.tsx`): A1=Principiante, A2=Elemental, B1=Intermedio, B2=Intermedio alto, C1=Avanzado, C2=Maestría. `loadSettings` migra valores antiguos numéricos (`'0'..'6'`) a sus códigos CEFR (ver `LEGACY_FILTER_MAP` en `settingsStore.ts`). Si el filtro actual apunta a una dificultad sin levels en el topic abierto, `LevelListScreen` lo limpia a `''` automáticamente.

### Badge ¡Nuevo!

Los levels cuya `date_added` sea de los últimos 30 días muestran el badge **¡Nuevo!** en `LevelListScreen`, siempre que el usuario no haya abierto ese level todavía. Al entrar en `PlayScreen` el level se marca como visto y desaparece el badge. Los IDs vistos se almacenan en `settingsStore.seenLevelIds` (AsyncStorage).

### Flujo de juego (PlayScreen)

#### Estado de escucha por frase
```
idle
  → [tap Listen]  → played (reproduce MP3 + muestra texto borroso)
  → [tap texto]   → revealed (muestra texto inglés nítido)
  → [tap Listen]  → reproduce de nuevo, sin cambiar de estado
```
El estado se resetea a `idle` en cada cambio de frase. El tipo `ListenState` también declara un cuarto valor `'playing'` pero nunca se asigna en el código actual (dead state — ver `DOC_INCONSISTENCIES.md`).

#### Gestos y teclado
| Gesto | Tecla (web/Mac) | Acción |
|---|---|---|
| Swipe ↑ | `↑` | **Fácil** — `rating -= 1`, avanza |
| Swipe ← | `←` | **OK** — `rating` sin cambio, avanza |
| Swipe ↓ | `↓` | **Difícil** — `rating += 1`, reinserta la frase más adelante en la cola, avanza |
| Swipe → | `→` | **Atrás** — retrocede una posición (no toca rating) |
| Tap ✕ | — | Salir sin confirmación |

Las teclas de cursor solo funcionan en `Platform.OS === 'web'`. Cada tecla dispara el método `trigger*` del ref de `PhraseCard`, que anima la tarjeta igual que el swipe correspondiente antes de invocar el callback. Los tres botones visibles debajo de la card (Difícil / OK / Fácil) hacen lo mismo — enseñan el gesto visualmente.

#### Sistema de rating ponderado relativo

Reemplaza al antiguo booleano `learned`. Cada frase tiene un estado persistente:

```ts
PhraseProg = {
  rating: number,                     // easy=-1, ok=0, hard=+1 (acumulador)
  seenCount: number,
  lastRating: 'easy'|'ok'|'hard'|null,
  lastSeenAt: number | null,          // ms timestamp
}
```

**Construcción de la cola de sesión** (`buildSessionQueue(levelId)` en `queries.ts`):

1. Toma todas las frases del nivel (sin filtrar).
2. `mean = promedio(rating_i)` sobre todas las frases del nivel.
3. Pesos `w_i = exp(K_RATING * (rating_i - mean))` con `K_RATING = 0.8`.
4. Weighted shuffle sin reemplazo (**Efraimidis–Spirakis**): `key_i = random()^(1/w_i)`, ordenar DESC.

**Constraint crítico — normalización relativa**: si todos los ratings son iguales, `rating_i - mean = 0` para todas las frases → pesos `exp(0) = 1` uniformes → `key_i = random()` → shuffle aleatorio puro. Es decir, calificar todo fácil o todo difícil **no tiene efecto** en la ordenación. Solo la desviación respecto al promedio del nivel cuenta.

**Dinámica durante la sesión** — encapsulada en `SessionController` (`src/db/session.ts`). `PlayScreen` la crea con `createSession(levelId)` y guarda la referencia en un `useRef`. El controller tiene estado en closure:

- `queue: Phrase[]` — cola mutable, inicialmente `buildSessionQueue(levelId)`.
- `cursor: number` — índice de la frase actual.
- `reinsertCount: Map<phraseId, number>` — reinserciones hard acumuladas por frase.
- `listens: number` — cuántas veces el usuario ha pulsado Listen en la sesión.
- `activeMs + segmentStart` — timer pausable de tiempo activo.

Métodos expuestos por `SessionController`:

| Método | Efecto |
|---|---|
| `current()` | `queue[cursor]` |
| `isFinished()` | `cursor >= queue.length` |
| `position() / size()` | cursor / longitud actual |
| `rate(rating)` | Persiste vía `ratePhraseInDb`; si `hard` llama a `reinsertHard` (con cap); `cursor++` |
| `back()` | `cursor = max(0, cursor - 1)`, no toca rating |
| `listen()` | `listens += 1` |
| `pause() / resume()` | acumula/reanuda `activeMs` |
| `finish()` | Llama `completeLevel(levelId, listens, Math.round(activeMs/1000))` (una sola vez, idempotente) y devuelve `getLevelStats(levelId)` |
| `repeat()` | Rebuild de la cola con los ratings actuales; resetea cursor/listens/timer |
| `resetAndRepeat()` | `resetLevelProgress(levelId)` + `repeat()` |

`PlayScreen` conecta estos métodos con:
- **Audio**: `handleListen` → `session.listen()` + `playAudio(phrase.audio_path)`.
- **Gestos y teclado**: `handleRate('easy'|'ok'|'hard')` → `session.rate(...)`; `handlePrev` → `session.back()`.
- **`AppState`**: listener que llama `session.pause()` en background/inactive y `session.resume()` en active.
- **Fin**: tras `s.rate(...)`, si `s.isFinished()` → `await s.finish()` → `FinishedView` con los stats devueltos.

Entre `hard` y la reinserción: si `reinsertCount[id] < MAX_REINSERT_PER_PHRASE` (3), la frase se inserta en `queue[min(cursor + K_HARD_REINSERT, queue.length)]`. Cap anti-loop: una frase eternamente difícil se reinserta máximo 3 veces por sesión, pero su `rating` persistente sigue creciendo y aparecerá primera en la siguiente sesión.

**Constantes exportadas desde `queries.ts`**: `K_RATING=0.8`, `K_HARD_REINSERT=4`, `MAX_REINSERT_PER_PHRASE=3`, `MASTERY_MARGIN=1`.

#### Overlay de la card

Línea discreta en la parte superior de cada tarjeta: `Visto N · Última: {fácil|ok|difícil|—}`. Los valores se leen del store para `phrase.id` y se pasan a `PhraseCard` como props `seenCount` y `lastRating`.

#### "Dominadas" — umbral relativo

`masteredCount` (reemplaza al antiguo `learnedCount`) es el número de frases con `rating ≤ mean - MASTERY_MARGIN`. Umbral **relativo**: si todos los ratings son iguales, `mean - 1` es menor que todos los ratings → 0 dominadas, coherente con el constraint de normalización. Se muestra en `LevelListScreen` como contador del nivel y en `FinishedView` como estadística de sesión.

#### FinishedView
- **Estadísticas mostradas**: `masteredCount / totalPhrases`, tiempo activo en esta lección (`totalTimeSeconds` formateado `Ns`/`Nm Ns`/`Nm`), número de `totalListens`. Todo devuelto por `session.finish()` → `getLevelStats(levelId)`.
- **Siguiente nivel** (botón primario, solo si existe): navega con `navigation.replace('Play', ...)` al siguiente nivel del mismo topic, respetando el `difficultyFilter` activo. Si el usuario filtró por A1, no saltará a un nivel de A2. Si es el último nivel del filtro, muestra *"Último nivel del tema"* en lugar del botón.
- **Repetir nivel**: `session.repeat()` — reconstruye la cola con `buildSessionQueue(levelId)` usando los ratings actuales (no resetea nada).
- **Empezar de cero**: `session.resetAndRepeat()` → `resetLevelProgress(levelId)` → todas las frases vuelven a `{rating:0, seenCount:0, lastRating:null, lastSeenAt:null}` → rebuild de la cola.
- **Volver al menú**: `navigation.goBack()`.

#### Migración desde el esquema antiguo

`loadProgress()` (en `appStore.ts`) detecta entries con `typeof learned === 'boolean'` y las convierte:
- `learned:true` → `{rating:-3, seenCount, lastRating:'easy', lastSeenAt:null}` (queda claramente por debajo del promedio, baja prioridad).
- `learned:false` → `{rating:0, seenCount, lastRating:null, lastSeenAt:null}`.

El `seenCount` del entry legacy se preserva. Tras migrar se llama a `saveProgress()` para persistir en el formato nuevo (idempotente — si ya no quedan entries legacy, `didMigrate` es `false` y no se reescribe).

### Sistema de audio

Implementado en `src/hooks/useAudio.ts`:

1. Para el audio anterior y lo descarga (`stopAsync` + `unloadAsync`) antes de cargar el nuevo.
2. `Audio.setAudioModeAsync({ playsInSilentModeIOS: true })` — funciona con el iPhone en silencio.
3. Carga por URI: `Audio.Sound.createAsync({ uri: phrase.audio_path })`. Tanto bundled como downloaded usan URIs `file://` en el mismo directorio, así que el hook no distingue entre ambos.

> `expo-file-system` debe importarse como `expo-file-system/legacy`. La versión principal (v19+) usa una API nueva sin `documentDirectory` ni `EncodingType`.

### Seeding / extracción de contenido

No hay seeding de base de datos — no hay base de datos. Lo que hay es extracción idempotente de ZIPs en el boot:

- `extractBundledLevels()` lee `BUNDLED_ZIPS` (array de `require()` estáticos en `appStore.ts`, **generado por `sync_mobile.py`**, no editar a mano) y extrae cada ZIP a `documentDirectory/levels/{id}/` si no existe o si `dateAdded` ha cambiado.
- `scanInstalledLevels()` recorre `documentDirectory/levels/`, lee cada `meta.json` + `phrases.json` + `topic.json` y puebla los arrays en memoria del store.

Si se añaden o modifican levels vía `sync_mobile.py`, basta con reiniciar la app: los nuevos ZIPs se extraen automáticamente y el progreso del usuario se conserva (vive en AsyncStorage, no en el directorio de levels).

### Descarga de niveles

Desde SettingsScreen el usuario puede pegar una URL que apunte a un ZIP con el mismo formato que los bundled (`meta.json` + `phrases.json` + `topic.json` + `audio/*.mp3`). `src/utils/downloadLevel.ts`:

1. Descarga el ZIP a `cacheDirectory/level_download.zip` usando `FileSystem.createDownloadResumable` (con progreso). Stage `'downloading'`.
2. Llama a `installDownloadedLevel(zipPath)` en `appStore.ts`, que lo extrae a `documentDirectory/levels/{id}/` y lo re-escanea. Stage `'extracting'`.
3. Stage `'done'` y en el `finally` borra el ZIP de caché (idempotente).
4. Si cualquier paso lanza, emite stage `'error'` con el `error.message`.

El tipo `DownloadProgress` incluye además un stage `'importing'` que hoy nunca se emite (ver `DOC_INCONSISTENCIES.md`). Bundled y downloaded son idénticos en runtime — mismo directorio, misma lectura, mismas operaciones. No hay JSON base64 ni formato intermedio.

### Settings — zona de peligro

`SettingsScreen` también expone un botón "Borrar todos los datos" que:
1. `FileSystem.deleteAsync(documentDirectory/levels/, {idempotent:true})`
2. `AsyncStorage.multiRemove(['progress','seenLevelIds','lastTopicId'])`
3. Resetea en memoria `seenLevelIds`/`lastTopicId`
4. Re-llama a `extractBundledLevels() → scanInstalledLevels() → loadProgress()`

Tras esto los levels bundleados vuelven a aparecer desde cero, sin progreso. Es la única forma de forzar la re-extracción de un level bundleado cuyo ZIP ha cambiado (ver bug de idempotencia más arriba).

### Tema visual

Tres paletas en `src/theme/index.ts`:
- **solarizedDark**: fondo `#002b36`, acentos azul/cyan
- **solarizedLight**: fondo crema `#fdf6e3`
- **solarizedNeon**: dark con colores más vibrantes (en el store pero aún no expuesta en Settings)

El usuario elige en SettingsScreen entre `system` / `light` / `dark`. `themeMode` persiste en AsyncStorage.

---

## Arrancar la app

### Setup inicial

```bash
cd mobile
npm install

# Generar audio bundleado (primera vez)
cd ../admin
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python generate_audio.py --all
python sync_mobile.py
cd ../mobile
```

### En simulador iOS (requiere Xcode)

```bash
npx expo start --ios
```

Teclas en el simulador: `↑` fácil, `↓` difícil, `←` OK (avanza), `→` atrás.

### En iPhone con Expo Go

```bash
npx expo start          # escanea el QR con la cámara del iPhone
npx expo start --tunnel  # si el QR no conecta
```

### Build nativa en iPhone (sin Expo Go)

```bash
npx expo run:ios --device   # requiere Xcode + cuenta Apple gratuita, expira en 7 días
```

### Comandos útiles

```bash
# Desde mobile/
npx tsc --noEmit            # verificar tipos
npm test                    # 59 tests, 4 suites
npx expo start --clear      # limpiar caché de Metro

# Desde admin/
python3 validate_levels.py  # valida admin/levels vs mobile/assets/levels
```

### Tests

Tests Jest en `mobile/__tests__/`, mocks en `mobile/__mocks__/`. 4 suites, 59 tests:

- **`appStore.test.ts`**: `loadProgress` / `saveProgress`, `scanInstalledLevels`, `setPhraseProgressEntry`, `setLevelProgressEntry`, `deleteLevelFromStore`. Usa mock de `expo-file-system/legacy` y `AsyncStorage` (global para sobrevivir `jest.resetModules()`).
- **`queries.test.ts`**: `getLevelsByTopic` con filtro de dificultad, `buildSessionQueue`, `ratePhraseInDb`, `getLevelStats` con umbral relativo, `resetLevelProgress`, `deleteLevel`.
- **`session.test.ts`**: constraint de normalización (todo igual → sin efecto), efecto relativo, reinserción hard con cap anti-loop, `getNextLevelId` respetando filtro, migración legacy desde `learned:boolean`, `masteredCount` con umbral relativo. Usa `jest.spyOn(Math, 'random')` para tests deterministas.
- **`sessionController.test.ts`**: el `SessionController` completo — pause/resume del timer inyectando `now`, contador de `listens`, `finish` idempotente (llamar dos veces no duplica `completedSessions`), `repeat` vs `resetAndRepeat`, reinserciones hard contabilizadas en la cola del controller.
