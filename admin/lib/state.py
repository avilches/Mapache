"""Cómputo del estado de admin/levels/ para la cabecera del menú.

No re-implementa validaciones exhaustivas — para eso está validate_levels.py.
Sólo mira admin/ (no compara con ZIPs ni appStore.ts).
"""
import json
import os
from typing import Optional

from .levels import parse_level_id, scan_level_dirs
from .paths import LEVELS_DIR
from .topics import load_topics


# status values
ST_COMPLETE = "complete"
ST_NO_META = "no_meta"
ST_INVALID_ID = "invalid_id"
ST_NO_PHRASES = "no_phrases"
ST_AUDIO_PARTIAL = "audio_partial"
ST_AUDIO_ORPHANS = "audio_orphans"


def _read_phrase_count(phrases_path: str) -> tuple[int, bool]:
    """(count, ok)"""
    try:
        with open(phrases_path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return sum(1 for p in data if isinstance(p, dict) and p.get("es") and p.get("en")), True
    except Exception:
        pass
    return 0, False


def _scan_audio(audio_dir: str) -> dict:
    """Devuelve {index (int): filename} para los mp3 válidos."""
    if not os.path.isdir(audio_dir):
        return {}
    out = {}
    for f in os.listdir(audio_dir):
        if f.endswith(".mp3"):
            stem = f[:-4]
            if stem.isdigit():
                out[int(stem)] = f
    return out


def _compute_level_info(dir_name: str, known_topic_ids: Optional[set[str]] = None) -> dict:
    info = {
        "id": dir_name,
        "topic_id": None,
        "level_id": None,
        "cefr": None,
        "n": None,
        "has_meta": False,
        "has_phrases": False,
        "phrase_count": 0,
        "mp3_count": 0,
        "missing_audio_indices": [],
        "orphan_mp3s": [],
        "status": ST_COMPLETE,
        "title": "",
    }

    parsed = parse_level_id(dir_name, known_topic_ids=known_topic_ids)
    if parsed is None:
        info["status"] = ST_INVALID_ID
        return info
    info["topic_id"], info["level_id"], info["cefr"], info["n"] = parsed

    level_dir = os.path.join(LEVELS_DIR, dir_name)
    meta_path = os.path.join(level_dir, "meta.json")
    phrases_path = os.path.join(level_dir, "phrases.json")
    audio_dir = os.path.join(level_dir, "audio")

    if not os.path.isfile(meta_path):
        info["status"] = ST_NO_META
        return info
    info["has_meta"] = True

    try:
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        info["title"] = meta.get("title", "")
    except Exception:
        info["status"] = ST_NO_META
        return info

    if not os.path.isfile(phrases_path):
        info["status"] = ST_NO_PHRASES
        return info
    info["has_phrases"] = True
    info["phrase_count"], _ok = _read_phrase_count(phrases_path)

    mp3_by_index = _scan_audio(audio_dir)
    info["mp3_count"] = len(mp3_by_index)

    expected_indices = set(range(1, info["phrase_count"] + 1))
    actual_indices = set(mp3_by_index.keys())

    info["missing_audio_indices"] = sorted(expected_indices - actual_indices)
    orphan_indices = sorted(actual_indices - expected_indices)
    info["orphan_mp3s"] = [mp3_by_index[i] for i in orphan_indices]

    if info["missing_audio_indices"]:
        info["status"] = ST_AUDIO_PARTIAL
    elif info["orphan_mp3s"]:
        info["status"] = ST_AUDIO_ORPHANS
    else:
        info["status"] = ST_COMPLETE
    return info


def compute_state(import_data: Optional[list] = None) -> dict:
    dirs = scan_level_dirs()
    topics_known = load_topics()
    known_topic_ids = {t["id"] for t in topics_known}
    levels = [_compute_level_info(d, known_topic_ids=known_topic_ids) for d in dirs]
    topics_used = sorted({l["topic_id"] for l in levels if l["topic_id"]})

    complete = sum(1 for l in levels if l["status"] == ST_COMPLETE)
    without_phrases = sum(1 for l in levels if l["status"] == ST_NO_PHRASES)
    missing_mp3_total = sum(len(l["missing_audio_indices"]) for l in levels)

    import_diff = None
    if import_data is not None:
        import_diff = _compute_import_diff(import_data, topics_known, dirs)

    return {
        "topics": {
            "known": [t["id"] for t in topics_known],
            "used_by_levels": topics_used,
        },
        "levels": levels,
        "import_diff": import_diff,
        "summary": {
            "levels_total": len(levels),
            "levels_complete": complete,
            "levels_without_phrases": without_phrases,
            "missing_mp3_total": missing_mp3_total,
        },
    }


def _compute_import_diff(import_data: list, existing_topics: list[dict], existing_dirs: list[str]) -> dict:
    existing_topic_ids = {t["id"] for t in existing_topics}

    topics_to_create = []
    for t in import_data:
        if t["id"] not in existing_topic_ids:
            topics_to_create.append({k: v for k, v in t.items() if k != "levels"})

    levels_to_create = []
    levels_already_ok = 0
    for t in import_data:
        topic_id = t["id"]
        for lv in t.get("levels", []):
            level_id = lv["id"]
            cefr = lv["difficulty"]
            prefix = f"{topic_id}-{level_id}-{cefr}-"
            if any(d.startswith(prefix) for d in existing_dirs):
                levels_already_ok += 1
                continue
            levels_to_create.append({
                "topic_id": topic_id,
                "level_id": level_id,
                "cefr": cefr,
                "title": lv["title"],
                "description": lv.get("description", ""),
            })

    return {
        "topics_to_create": topics_to_create,
        "levels_to_create": levels_to_create,
        "levels_already_ok": levels_already_ok,
    }
