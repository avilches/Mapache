#!/usr/bin/env python3
"""
Genera los MP3 de un level a partir de su phrases.json.

Uso:
    python generate_audio.py <level-id>   — genera audio de un level
    python generate_audio.py --all        — genera audio de todos los levels

Los MP3 se escriben en levels/<level-id>/audio/001.mp3, 002.mp3, ...
Los archivos existentes se saltan (no se regeneran).
"""
import json
import os
import sys
from gtts import gTTS

LEVELS_DIR = os.path.join(os.path.dirname(__file__), "levels")


def load_english_phrases(phrases_path: str) -> list[str]:
    with open(phrases_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return []
    out = []
    for p in data:
        if isinstance(p, dict) and p.get("en"):
            out.append(str(p["en"]).strip())
    return out


def generate_for_level(level_id: str) -> None:
    level_dir = os.path.join(LEVELS_DIR, level_id)
    phrases_path = os.path.join(level_dir, "phrases.json")
    audio_dir = os.path.join(level_dir, "audio")

    if not os.path.exists(phrases_path):
        print(f"  [error] {level_id}: no se encuentra phrases.json")
        return

    phrases = load_english_phrases(phrases_path)
    if not phrases:
        print(f"  [skip]  {level_id}: phrases.json vacío")
        return

    os.makedirs(audio_dir, exist_ok=True)

    print(f"Level {level_id} ({len(phrases)} frases):")
    for i, text in enumerate(phrases, start=1):
        filename = f"{i:03d}.mp3"
        filepath = os.path.join(audio_dir, filename)
        if os.path.exists(filepath):
            print(f"  [skip] {filename}")
            continue
        print(f"  [gen]  {filename}: {text}")
        tts = gTTS(text=text, lang="en", slow=False)
        tts.save(filepath)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    arg = sys.argv[1]

    if arg == "--all":
        level_ids = sorted(
            d for d in os.listdir(LEVELS_DIR)
            if os.path.isdir(os.path.join(LEVELS_DIR, d))
        )
        for level_id in level_ids:
            generate_for_level(level_id)
    else:
        level_id = arg
        if not os.path.isdir(os.path.join(LEVELS_DIR, level_id)):
            print(f"Error: no existe levels/{level_id}")
            sys.exit(1)
        generate_for_level(level_id)

    print("\n✅ Listo.")


if __name__ == "__main__":
    main()
