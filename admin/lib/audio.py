"""Generación de MP3 a partir del campo `en` de phrases.json.

Backend configurable via .env:
- Si OPENAI_API_KEY está definida → OpenAI TTS (VOICE_MODEL, VOICE_NAME, VOICE_SPEED)
- Si no → gTTS (fallback gratuito)

Idempotente: sólo genera los mp3 que faltan. No borra huérfanos (los reporta).
"""
import json
import os

from dotenv import load_dotenv

from .paths import LEVELS_DIR

_HERE = os.path.dirname(__file__)
load_dotenv(os.path.join(_HERE, os.pardir, ".env"))


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


def _generate_with_openai(text: str, filepath: str) -> None:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    model = os.environ.get("VOICE_MODEL", "tts-1-hd")
    voice = os.environ.get("VOICE_NAME", "nova")
    speed = float(os.environ.get("VOICE_SPEED", "0.9"))
    response = client.audio.speech.create(
        model=model,
        voice=voice,
        input=text,
        speed=speed,
    )
    response.stream_to_file(filepath)


def _generate_with_gtts(text: str, filepath: str) -> None:
    from gtts import gTTS
    tts = gTTS(text=text, lang="en", slow=False)
    tts.save(filepath)


def generate_audio_for_level(level_id: str, on_progress=None) -> AudioResult:
    """Genera los mp3 que faltan.

    on_progress(i, total, text, skipped) se llama tras cada frase procesada.
    """
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

    use_openai = bool(os.environ.get("OPENAI_API_KEY"))
    os.makedirs(audio_dir, exist_ok=True)
    total = len(phrases)

    for i, text in enumerate(phrases, start=1):
        filename = f"{i:03d}.mp3"
        filepath = os.path.join(audio_dir, filename)
        if os.path.exists(filepath):
            result.skipped.append(i)
            if on_progress:
                on_progress(i, total, text, skipped=True)
            continue
        if use_openai:
            _generate_with_openai(text, filepath)
        else:
            _generate_with_gtts(text, filepath)
        result.generated.append(i)
        if on_progress:
            on_progress(i, total, text, skipped=False)

    # huérfanos: mp3 con índice > len(phrases)
    if os.path.isdir(audio_dir):
        for f in sorted(os.listdir(audio_dir)):
            if not f.endswith(".mp3"):
                continue
            stem = f[:-4]
            if stem.isdigit() and int(stem) > len(phrases):
                result.orphan_mp3s.append(f)

    return result