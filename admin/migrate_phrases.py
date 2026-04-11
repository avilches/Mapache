#!/usr/bin/env python3
"""
One-shot: migra phrases.txt (CSV) → phrases.json (nuevo formato con grammar_focus y tip).
Borra los .txt al terminar.

Uso: python3 admin/migrate_phrases.py
"""
import csv
import json
import os

LEVELS_DIR = os.path.join(os.path.dirname(__file__), "levels")


def migrate(level_id: str) -> None:
    level_dir = os.path.join(LEVELS_DIR, level_id)
    txt_path = os.path.join(level_dir, "phrases.txt")
    json_path = os.path.join(level_dir, "phrases.json")

    if not os.path.isfile(txt_path):
        print(f"  [skip] {level_id}: no hay phrases.txt")
        return

    if os.path.isfile(json_path):
        print(f"  [skip] {level_id}: ya existe phrases.json")
        return

    phrases = []
    with open(txt_path, encoding="utf-8") as f:
        reader = csv.reader(f, skipinitialspace=True)
        for row in reader:
            if len(row) >= 2 and row[0].strip() and row[1].strip():
                phrases.append({
                    "es": row[0].strip(),
                    "en": row[1].strip(),
                    "grammar_focus": "",
                    "tip": ""
                })

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(phrases, f, ensure_ascii=False, indent=2)

    os.remove(txt_path)
    print(f"  ✓ {level_id}: {len(phrases)} frases migradas → phrases.json (phrases.txt eliminado)")


def main():
    level_ids = sorted(
        d for d in os.listdir(LEVELS_DIR)
        if os.path.isdir(os.path.join(LEVELS_DIR, d))
    )
    print(f"Migrando {len(level_ids)} levels...")
    for level_id in level_ids:
        migrate(level_id)
    print("Listo.")


if __name__ == "__main__":
    main()
