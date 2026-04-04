#!/usr/bin/env python3
"""
Genera los MP3 de un pack a partir de su phrases.txt.

Uso:
    python generate_audio.py <pack-id>   — genera audio de un pack
    python generate_audio.py --all       — genera audio de todos los packs

Los MP3 se escriben en packs/<pack-id>/audio/001.mp3, 002.mp3, ...
Los archivos existentes se saltan (no se regeneran).
"""
import csv
import os
import sys
from gtts import gTTS

PACKS_DIR = os.path.join(os.path.dirname(__file__), "packs")


def load_english_phrases(phrases_path: str) -> list[str]:
    phrases = []
    with open(phrases_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f, skipinitialspace=True)
        for row in reader:
            if len(row) >= 2:
                phrases.append(row[1].strip())
    return phrases


def generate_for_pack(pack_id: str) -> None:
    pack_dir = os.path.join(PACKS_DIR, pack_id)
    phrases_path = os.path.join(pack_dir, "phrases.txt")
    audio_dir = os.path.join(pack_dir, "audio")

    if not os.path.exists(phrases_path):
        print(f"  [error] {pack_id}: no se encuentra phrases.txt")
        return

    phrases = load_english_phrases(phrases_path)
    if not phrases:
        print(f"  [skip]  {pack_id}: phrases.txt vacío")
        return

    os.makedirs(audio_dir, exist_ok=True)

    print(f"Pack {pack_id} ({len(phrases)} frases):")
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
        pack_ids = sorted(
            d for d in os.listdir(PACKS_DIR)
            if os.path.isdir(os.path.join(PACKS_DIR, d))
        )
        for pack_id in pack_ids:
            generate_for_pack(pack_id)
    else:
        pack_id = arg
        if not os.path.isdir(os.path.join(PACKS_DIR, pack_id)):
            print(f"Error: no existe packs/{pack_id}")
            sys.exit(1)
        generate_for_pack(pack_id)

    print("\n✅ Listo.")


if __name__ == "__main__":
    main()
