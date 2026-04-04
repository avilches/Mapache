# LinguaTrainer

A mobile app for learning English phrases through swipeable flashcards, built with React Native + Expo.

Phrases are shown in Spanish. You listen to the audio, reveal the English translation, and swipe to decide whether you've learned it. No account, no internet required, fully offline.

---

## How it works

Each flashcard goes through a simple flow:

1. See the phrase in Spanish
2. Tap **Listen** → audio plays in English
3. Tap **Listen** again → English text is revealed
4. **Swipe left** to move to the next phrase
5. **Swipe up** to mark it as learned (won't appear again this session)
6. **Swipe right** to go back to the previous phrase

When all active phrases have been seen, a summary screen shows how many you learned. You can repeat the level (skipping learned phrases) or reset from scratch.

---

## Content

Three themes included, each with three difficulty levels:

| Theme | Levels |
|---|---|
| 👋 Greetings | Basic · Intermediate · Advanced |
| 🍽️ Restaurant | Basic · Intermediate · Advanced |
| ✈️ Travel | Basic · Intermediate · Advanced |

New levels can be downloaded from the Settings screen without updating the app.

---

## Tech stack

| | |
|---|---|
| React Native + Expo SDK 54 | Mobile framework |
| TypeScript | Language |
| React Navigation 7 | Navigation |
| Reanimated 3 + Gesture Handler | Animations and swipes |
| Expo AV | Audio playback |
| expo-sqlite | Local database |
| Zustand + AsyncStorage | Settings |
| gTTS (Python) | Audio generation |

---

## Getting started

See [SPECS.md](SPECS.md) for the full setup guide, architecture, and content workflow.

### Quick start

```bash
# Mobile app
cd mobile && npm install

# Generate bundled audio and sync packs
cd admin
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python generate_audio.py --all
python sync_mobile.py

# Run on iOS simulator (requires Xcode)
cd ../mobile && npx expo start --ios
```

---

## License

MIT
