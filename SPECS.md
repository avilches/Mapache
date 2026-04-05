# LinguaTrainer — Especificaciones completas

App iOS para entrenar frases en inglés mediante tarjetas. Muestra la frase en español, el usuario escucha el audio, revela la traducción y decide si la marca como aprendida. Sin login, sin servidor, todo local.

---

## Estructura del repositorio

```
admin/                       Scripts Python de gestión de contenido
├── new_pack.py              Crea el scaffold de un nuevo pack
├── generate_audio.py        Genera MP3 de un pack desde phrases.txt
├── sync_mobile.py           Sincroniza todos los packs con la app móvil
├── practice.py              TUI de práctica en terminal (sin móvil)
├── requirements.txt         gtts, textual, rich
└── packs/                   Fuente de verdad de todo el contenido
    ├── greet-basic-1/       Un pack = una carpeta
    │   ├── meta.json        Metadatos del pack y su tema
    │   ├── phrases.txt      Frases CSV: "español","english"
    │   └── audio/           MP3 generados: 001.mp3, 002.mp3...
    ├── greet-basic-2/ greet-interm-1/ greet-adv-1/
    ├── rest-basic-1/ rest-interm-1/ rest-adv-1/
    ├── trav-basic-1/ trav-interm-1/ trav-adv-1/
    └── daily-interm-1/

mobile/                      App React Native + Expo
├── App.tsx                  Entrada, init DB, navegación
├── assets/audio/            MP3 bundleados (copiados por sync_mobile.py)
└── src/
    ├── data/seed.ts         Contenido bundleado (generado por sync_mobile.py)
    ├── hooks/useAudio.ts    BUNDLED_AUDIO map (generado por sync_mobile.py)
    ├── db/schema.ts         initDb(), getDb()
    ├── db/queries.ts        Todas las funciones de lectura/escritura
    ├── theme/index.ts       Paletas solarizadas + useTheme()
    ├── store/settingsStore  Zustand: themeMode, difficultyFilter, seenLevelIds
    ├── utils/downloadLevel  Descarga e instala niveles por URL
    ├── components/PhraseCard Card animada con gestos
    └── screens/             Home, LevelList, Play, Settings
```

---

## Gestión de contenido (admin/)

### Convención de nombres de packs

El ID de un pack sigue el formato: `<tema>-<dificultad>-<número>`

- **`<tema>`**: prefijo corto del tema (`greet`, `rest`, `trav`, `daily`...)
- **`<dificultad>`**: `basic` | `interm` | `adv` (1, 2, 3 respectivamente)
- **`<número>`**: orden dentro de la serie del mismo tema y dificultad (1, 2, 3...)

```
greet-basic-1   → saludos, básico, pack nº1
greet-basic-2   → saludos, básico, pack nº2  (continuación de la serie)
greet-interm-1  → saludos, intermedio, pack nº1
trav-adv-2      → viajes, avanzado, pack nº2
```

El sufijo numérico es **orden de secuencia**, no dificultad. La dificultad va en el nombre y en el campo `difficulty` de `meta.json`. Esto permite añadir nuevos packs a una serie sin alterar el significado de los existentes.

### Flujo completo para añadir un pack nuevo

```bash
cd admin
source .venv/bin/activate    # o: python3 -m venv .venv && pip install -r requirements.txt

# 1. Crear scaffold
python new_pack.py greet-basic-2

# 2. Editar packs/greet-basic-2/meta.json y rellenar packs/greet-basic-2/phrases.txt

# 3. Generar audio
python generate_audio.py greet-basic-2

# 4. Sincronizar con la app
python sync_mobile.py

# 5. Reinstalar la app (o limpiar datos) para que se resiembre la BD
```

Los packs nuevos aparecen con badge **¡Nuevo!** en la app durante los 30 días siguientes a su `dateAdded` (si el usuario no los ha abierto todavía).

### Series y temas

Los packs se agrupan por `themeId` en `meta.json`. Todos los packs con el mismo `themeId` aparecen bajo el mismo tab. El `sort_order` controla el orden en la lista.

```
themeId: "greetings"  →  greet-basic-1, greet-basic-2, greet-interm-1, greet-adv-1
themeId: "restaurant" →  rest-basic-1, rest-interm-1, rest-adv-1
themeId: "travel"     →  trav-basic-1, trav-interm-1, trav-adv-1
themeId: "daily"      →  daily-interm-1, daily-interm-2...
```

Para añadir a una serie existente: usa el mismo `themeId` y el siguiente `sort_order`. Para una nueva serie: nuevo `themeId` + nuevo `themeOrder`.

### Formato de meta.json

```json
{
  "id":         "greet-basic-2",  — ID único del pack (= nombre del directorio)
  "themeId":    "greetings",      — Agrupa el pack bajo un tema/tab
  "themeName":  "Saludos",        — Nombre visible (solo si el tema es nuevo)
  "themeIcon":  "👋",             — Emoji del tema (solo si el tema es nuevo)
  "themeColor": "#268bd2",        — Color hex del tema (solo si el tema es nuevo)
  "themeOrder": 0,                — Orden del tab (solo si el tema es nuevo)
  "title":      "Saludos en el trabajo", — Título descriptivo del pack
  "difficulty": 1,                — 1=básico 2=intermedio 3=avanzado
  "sort_order": 2,                — Posición en la lista del tema (único por tema)
  "dateAdded":  "2026-04-04"      — Fecha YYYY-MM-DD
}
```

### Formato de phrases.txt

CSV sin cabecera, una frase por línea:

```
"Hola","Hello"
"Buenos días","Good morning"
```

### sync_mobile.py — qué genera

| Destino | Fuente |
|---|---|
| `mobile/assets/audio/{id}/*.mp3` | `admin/packs/{id}/audio/*.mp3` |
| `mobile/src/data/seed.ts` | Todos los `meta.json` + `phrases.txt` |
| `BUNDLED_AUDIO` en `useAudio.ts` | Todos los packs con audio |

Solo se sincronizan packs que tienen la carpeta `audio/` con MP3s. Si un pack no tiene audio, se salta con aviso.

### practice.py — herramienta de escritorio

```bash
python practice.py packs/daily-interm-1/phrases.txt
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
| React Navigation | 7.x | Stack + Tabs |
| Reanimated 3 | ~4.1 | Animaciones de cards |
| Gesture Handler | ~2.28 | Swipes |
| Expo AV | ~16 | Reproducción MP3 |
| expo-file-system/legacy | ~19 | Descarga y escritura de archivos |
| expo-sqlite | ~16 | Base de datos local |
| Zustand + AsyncStorage | — | Estado de ajustes |

### Modelo de datos (SQLite)

```sql
themes         (id, name, icon, color, sort_order)
levels         (id, theme_id, title, difficulty 1|2|3, sort_order, date_added, total_phrases, source)
phrases        (id, level_id, spanish, english, audio_path, sort_order)
phrase_progress (phrase_id, level_id, learned 0|1, seen_count)   PRIMARY KEY (phrase_id, level_id)
level_progress  (level_id, completed_sessions, last_played_at)
```

#### Convención audio_path
- Bundleado: `bundled:{levelId}:{index}` → resuelto por `BUNDLED_AUDIO` en `useAudio.ts`
- Descargado: URI absoluta `file://...documentDirectory/levels/{levelId}/audio/001.mp3`

### Navegación

```
HomeScreen
  └─ [Empezar] → Tab Navigator (una pestaña por tema, generado desde BD)
                    └─ LevelListScreen
                         └─ [tap nivel] → PlayScreen
                                            └─ CompletionView (inline)
  └─ [⚙️] → SettingsScreen
```

Los tabs se generan dinámicamente desde la tabla `themes`, por lo que añadir un tema nuevo vía sync o descarga crea el tab automáticamente al reiniciar la app.

### Filtro de dificultad

El usuario puede filtrar globalmente por dificultad (Todos / Básico / Intermedio / Avanzado) desde SettingsScreen. El filtro se persiste en AsyncStorage y se aplica en `getLevelsByTheme()`. Cuando hay filtro activo, `LevelListScreen` muestra un badge indicando el nivel activo.

### Badge ¡Nuevo!

Los packs cuya `date_added` sea de los últimos 30 días muestran el badge **¡Nuevo!** en `LevelListScreen`, siempre que el usuario no haya abierto ese pack todavía. Al entrar en `PlayScreen` el pack se marca como visto y desaparece el badge. Los IDs vistos se almacenan en AsyncStorage (`seenLevelIds`).

### Flujo de juego (PlayScreen)

#### Estado por frase
```
idle
  → [tap Listen]  → playing (reproduce MP3)
  → [audio listo] → revealed (muestra texto inglés)
  → [tap Listen]  → reproduce de nuevo, sigue en revealed
```
Estado se resetea a `idle` en cada cambio de frase.

#### Gestos
| Gesto | Acción |
|---|---|
| Swipe ← (o tecla →) | Siguiente frase |
| Swipe → (o tecla ←) | Frase anterior |
| Swipe ↑ (o tecla ↑) | Marcar como aprendida → sale del nivel activo |
| Tap ✕ | Salir con confirmación |

Las teclas de cursor solo funcionan en web/simulador Mac (`Platform.OS === 'web'`).

#### Lógica de progreso
- `handleNext`: llama `markPhraseSeenInDb` (incrementa `seen_count`)
- Swipe arriba: `markPhraseLearnedInDb` → `learned = 1` → elimina del array activo
- Sin frases activas: `completeLevel()` → incrementa `completed_sessions` → muestra `CompletionView`

#### CompletionView
- **Repetir nivel**: recarga `getActivePhrases()` (excluye `learned = 1`)
- **Empezar de cero**: `resetLevelProgress()` → borra `phrase_progress` del nivel → recarga todo
- **Volver al menú**: `navigation.goBack()`

### Sistema de audio

1. Para el audio anterior y lo descarga (`stopAsync` + `unloadAsync`)
2. `Audio.setAudioModeAsync({ playsInSilentModeIOS: true })` — funciona en silencio en iOS
3. Bundleado: `require()` estático desde `BUNDLED_AUDIO`
4. Descargado: `{ uri: 'file://...' }`

> `expo-file-system` debe importarse como `expo-file-system/legacy`. La versión principal (v19+) usa una API nueva sin `documentDirectory`.

### Seeding

`seedDatabase()` se ejecuta en el arranque. Comprueba `SELECT COUNT(*) FROM themes` — si > 0, no hace nada. Para forzar un re-seed tras modificar packs: desinstalar la app o borrar sus datos de SQLite.

### Descarga de niveles

Desde SettingsScreen el usuario puede pegar una URL. La app descarga un JSON con este formato:

```json
{
  "metadata": {
    "id": "trav-adv-2",
    "themeId": "travel",
    "themeName": "Viajes",
    "themeIcon": "✈️",
    "themeColor": "#859900",
    "title": "Situaciones imprevistas 2",
    "difficulty": 3,
    "sort_order": 4,
    "dateAdded": "2024-06-01"
  },
  "phrases": [{ "spanish": "...", "english": "..." }],
  "audio": { "001": "<base64 mp3>", "002": "..." }
}
```

Los MP3 se guardan en `documentDirectory/levels/{levelId}/audio/`, el tema/nivel/frases se insertan en SQLite.

### Tema visual

Tres paletas en `src/theme/index.ts`:
- **solarizedDark**: fondo `#002b36`, acentos azul/cyan
- **solarizedLight**: fondo crema `#fdf6e3`
- **solarizedNeon**: dark con colores más vibrantes

Persiste en AsyncStorage. Por defecto: modo sistema.

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

Teclas en el simulador: `→` siguiente, `←` anterior, `↑` marcar aprendida.

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
npx tsc --noEmit            # verificar tipos
npx expo start --clear      # limpiar caché de Metro
```
