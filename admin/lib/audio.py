"""Generación de MP3 vía gTTS a partir del campo `en` de phrases.json.

Idempotente: sólo genera los mp3 que faltan. No borra huérfanos (los reporta).
"""
import json
import os

from .paths import LEVELS_DIR


class AudioResult:
    def __init__(self):
        self.generated: list[int] = []
        self.skipped: list[int] = []
        self.orphan_mp3s: list[str] = []  # mp3s con índice > nº frases
        self.error: str = ""


def _load_english_phrases(phrases_path: str) -> list[str]:
    with open(phrases_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return []
    out = []
    for p in data:
        if isinstance(p, dict) and p.get("en"):
            out.append(str(p["en"]).strip())
    return out


def generate_audio_for_level(level_id: str) -> AudioResult:
    from gtts import gTTS  # lazy import

    result = AudioResult()
    level_dir = os.path.join(LEVELS_DIR, level_id)
    phrases_path = os.path.join(level_dir, "phrases.json")
    audio_dir = os.path.join(level_dir, "audio")

    if not os.path.exists(phrases_path):
        result.error = "no se encuentra phrases.json"
        return result

    phrases = _load_english_phrases(phrases_path)
    if not phrases:
        result.error = "phrases.json vacío"
        return result

    os.makedirs(audio_dir, exist_ok=True)

    for i, text in enumerate(phrases, start=1):
        filename = f"{i:03d}.mp3"
        filepath = os.path.join(audio_dir, filename)
        if os.path.exists(filepath):
            result.skipped.append(i)
            continue
        tts = gTTS(text=text, lang="en", slow=False)
        tts.save(filepath)
        result.generated.append(i)

    # huérfanos: mp3 con índice > len(phrases)
    if os.path.isdir(audio_dir):
        for f in sorted(os.listdir(audio_dir)):
            if not f.endswith(".mp3"):
                continue
            stem = f[:-4]
            if stem.isdigit() and int(stem) > len(phrases):
                result.orphan_mp3s.append(f)

    return result
