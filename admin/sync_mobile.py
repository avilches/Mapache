#!/usr/bin/env python3
"""
Sincroniza todos los packs de admin/packs/ con la app móvil.

Qué hace:
  1. Copia packs/<id>/audio/*.mp3  →  mobile/assets/audio/<id>/*.mp3
  2. Regenera mobile/src/data/seed.ts       (themes, levels, phrases)
  3. Regenera el bloque BUNDLED_AUDIO en mobile/src/hooks/useAudio.ts

Solo se incluyen packs que tengan audio generado (carpeta audio/ no vacía).

Uso: python sync_mobile.py

Después de ejecutar:
  - Reinstala o limpia los datos de la app para que se resiembre la BD.
"""
import csv
import json
import os
import shutil
import sys

PACKS_DIR = os.path.join(os.path.dirname(__file__), "packs")
MOBILE_DIR = os.path.join(os.path.dirname(__file__), "..", "mobile")
AUDIO_OUT = os.path.join(MOBILE_DIR, "assets", "audio")
SEED_TS = os.path.join(MOBILE_DIR, "src", "data", "seed.ts")
USE_AUDIO_TS = os.path.join(MOBILE_DIR, "src", "hooks", "useAudio.ts")


# ── helpers ──────────────────────────────────────────────────────────────────

def load_pack(pack_id: str) -> dict | None:
    pack_dir = os.path.join(PACKS_DIR, pack_id)
    meta_path = os.path.join(pack_dir, "meta.json")
    phrases_path = os.path.join(pack_dir, "phrases.txt")
    audio_dir = os.path.join(pack_dir, "audio")

    if not os.path.exists(meta_path) or not os.path.exists(phrases_path):
        return None

    mp3s = sorted(f for f in os.listdir(audio_dir) if f.endswith(".mp3")) if os.path.isdir(audio_dir) else []
    if not mp3s:
        print(f"  [skip] {pack_id}: sin audio — ejecuta generate_audio.py {pack_id} primero")
        return None

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    phrases = []
    with open(phrases_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f, skipinitialspace=True)
        for row in reader:
            if len(row) >= 2:
                phrases.append({"spanish": row[0].strip(), "english": row[1].strip()})

    if len(phrases) != len(mp3s):
        print(f"  [warn] {pack_id}: {len(phrases)} frases pero {len(mp3s)} MP3 — puede que falte regenerar audio")

    return {"meta": meta, "phrases": phrases, "mp3s": mp3s}


def load_all_packs() -> list[dict]:
    pack_ids = sorted(d for d in os.listdir(PACKS_DIR) if os.path.isdir(os.path.join(PACKS_DIR, d)))
    packs = []
    for pack_id in pack_ids:
        pack = load_pack(pack_id)
        if pack:
            packs.append(pack)
    return packs


# ── step 1: copy audio ───────────────────────────────────────────────────────

def copy_audio(packs: list[dict]) -> None:
    for pack in packs:
        pack_id = pack["meta"]["id"]
        src_dir = os.path.join(PACKS_DIR, pack_id, "audio")
        dst_dir = os.path.join(AUDIO_OUT, pack_id)
        os.makedirs(dst_dir, exist_ok=True)
        for mp3 in pack["mp3s"]:
            src = os.path.join(src_dir, mp3)
            dst = os.path.join(dst_dir, mp3)
            shutil.copy2(src, dst)
        print(f"  [audio] {pack_id}: {len(pack['mp3s'])} MP3")


# ── step 2: regenerate seed.ts ───────────────────────────────────────────────

def _ts_str(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def generate_seed_ts(packs: list[dict]) -> str:
    # Deduplicate themes, sorted by themeOrder
    seen_themes: dict[str, dict] = {}
    for pack in packs:
        m = pack["meta"]
        tid = m["themeId"]
        if tid not in seen_themes:
            seen_themes[tid] = {
                "id": tid,
                "name": m["themeName"],
                "icon": m["themeIcon"],
                "color": m["themeColor"],
                "sort_order": m["themeOrder"],
            }
    themes = sorted(seen_themes.values(), key=lambda t: t["sort_order"])

    lines = []
    lines.append("import { getDb } from '../db/schema';")
    lines.append("import { insertTheme, insertLevel, insertPhrase } from '../db/queries';")
    lines.append("")

    # THEMES
    lines.append("const THEMES = [")
    for t in themes:
        lines.append(
            f"  {{ id: {_ts_str(t['id'])}, name: {_ts_str(t['name'])}, "
            f"icon: {_ts_str(t['icon'])}, color: {_ts_str(t['color'])}, "
            f"sort_order: {t['sort_order']} }},"
        )
    lines.append("];")
    lines.append("")

    # LEVELS
    lines.append("const LEVELS = [")
    for pack in packs:
        m = pack["meta"]
        n = len(pack["phrases"])
        lines.append(
            f"  {{ id: {_ts_str(m['id'])}, theme_id: {_ts_str(m['themeId'])}, "
            f"title: {_ts_str(m['title'])}, difficulty: {m['difficulty']} as const, "
            f"date_added: {_ts_str(m['dateAdded'])}, total_phrases: {n}, source: 'bundled' }},"
        )
    lines.append("];")
    lines.append("")

    # PHRASES
    lines.append(
        "const PHRASES: { id: string; level_id: string; spanish: string; "
        "english: string; audio_path: string; sort_order: number }[] = ["
    )
    for pack in packs:
        pack_id = pack["meta"]["id"]
        lines.append(f"  // {pack_id}")
        for i, phrase in enumerate(pack["phrases"], start=1):
            phrase_id = f"{pack_id}-{i}"
            sp = _ts_str(phrase["spanish"])
            en = _ts_str(phrase["english"])
            ap = _ts_str(f"bundled:{pack_id}:{i}")
            lines.append(
                f"  {{ id: {_ts_str(phrase_id)}, level_id: {_ts_str(pack_id)}, "
                f"spanish: {sp}, english: {en}, audio_path: {ap}, sort_order: {i} }},"
            )
        lines.append("")
    lines.append("];")
    lines.append("")

    # seedDatabase function (unchanged logic)
    lines.append("let seeded = false;")
    lines.append("")
    lines.append("export async function seedDatabase(): Promise<void> {")
    lines.append("  if (seeded) return;")
    lines.append("")
    lines.append("  const db = await getDb();")
    lines.append("  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM themes');")
    lines.append("  if (existing && existing.count > 0) {")
    lines.append("    seeded = true;")
    lines.append("    return;")
    lines.append("  }")
    lines.append("")
    lines.append("  for (const theme of THEMES) await insertTheme(theme);")
    lines.append("  for (const level of LEVELS) await insertLevel(level);")
    lines.append("  for (const phrase of PHRASES) await insertPhrase(phrase);")
    lines.append("")
    lines.append("  seeded = true;")
    lines.append("}")
    lines.append("")

    return "\n".join(lines)


# ── step 3: regenerate BUNDLED_AUDIO in useAudio.ts ─────────────────────────

def generate_bundled_audio_block(packs: list[dict]) -> str:
    lines = []
    lines.append("const BUNDLED_AUDIO: Record<string, any> = {")
    for pack in packs:
        pack_id = pack["meta"]["id"]
        for i in range(1, len(pack["phrases"]) + 1):
            key = f"bundled:{pack_id}:{i}"
            path = f"../../assets/audio/{pack_id}/{i:03d}.mp3"
            lines.append(f"  {repr(key)}: require({repr(path)}),")
    lines.append("};")
    return "\n".join(lines)


def update_use_audio_ts(packs: list[dict]) -> None:
    with open(USE_AUDIO_TS, "r", encoding="utf-8") as f:
        lines = f.readlines()

    start = None
    end = None
    for i, line in enumerate(lines):
        if "const BUNDLED_AUDIO: Record<string, any> = {" in line:
            start = i
        if start is not None and i > start and line.strip() == "};":
            end = i
            break

    if start is None or end is None:
        print("  [error] No se encontró el bloque BUNDLED_AUDIO en useAudio.ts")
        sys.exit(1)

    new_block = generate_bundled_audio_block(packs) + "\n"
    new_lines = lines[:start] + [new_block] + lines[end + 1:]

    with open(USE_AUDIO_TS, "w", encoding="utf-8") as f:
        f.writelines(new_lines)


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("Leyendo packs...")
    packs = load_all_packs()
    if not packs:
        print("No hay packs con audio. Ejecuta generate_audio.py primero.")
        sys.exit(1)
    print(f"  {len(packs)} packs listos: {[p['meta']['id'] for p in packs]}")

    print("\nCopiando audio → mobile/assets/audio/")
    copy_audio(packs)

    print("\nRegenerando mobile/src/data/seed.ts")
    seed_content = generate_seed_ts(packs)
    with open(SEED_TS, "w", encoding="utf-8") as f:
        f.write(seed_content)

    print("Regenerando BUNDLED_AUDIO en mobile/src/hooks/useAudio.ts")
    update_use_audio_ts(packs)

    total_phrases = sum(len(p["phrases"]) for p in packs)
    print(f"\n✅ Sync completado: {len(packs)} packs, {total_phrases} frases.")
    print("   ⚠️  Reinstala o limpia los datos de la app para que se resiembre la BD.")


if __name__ == "__main__":
    main()
