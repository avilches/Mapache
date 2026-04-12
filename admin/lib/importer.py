"""Importación de levels desde import.json."""
import json
from typing import Optional

from .levels import create_level_dir, scan_level_dirs
from .paths import IMPORT_JSON
from .topics import load_topics, save_topics


class ImportResult:
    def __init__(self):
        self.topics_created: list[str] = []
        self.levels_created: list[str] = []  # ids completos
        self.errors: list[str] = []


def load_import_json() -> list[dict]:
    with open(IMPORT_JSON, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("import.json debe ser un array JSON")
    return data


def validate_import_data(import_data: list[dict]) -> list[str]:
    """Valida unicidad de (topic, level, cefr) y campos mínimos."""
    errors = []
    seen = set()
    for i, t in enumerate(import_data):
        required = {"id", "title", "description", "icon", "color", "levels"}
        missing = required - set(t.keys())
        if missing:
            errors.append(f"topic[{i}] faltan campos: {sorted(missing)}")
            continue
        if not isinstance(t["levels"], list):
            errors.append(f"topic[{t['id']}]: 'levels' debe ser array")
            continue
        for j, lv in enumerate(t["levels"]):
            req = {"id", "title", "difficulty", "description"}
            missing = req - set(lv.keys())
            if missing:
                errors.append(f"topic[{t['id']}].levels[{j}] faltan: {sorted(missing)}")
                continue
            key = (t["id"], lv["id"], lv["difficulty"])
            if key in seen:
                errors.append(f"duplicado en import.json: {key}")
            seen.add(key)
    return errors


def apply_import(import_data: Optional[list[dict]] = None) -> ImportResult:
    """Crea topics + level dirs que falten. Idempotente."""
    result = ImportResult()

    if import_data is None:
        import_data = load_import_json()

    errors = validate_import_data(import_data)
    if errors:
        result.errors = errors
        return result

    # 1. Topics nuevos
    topics = load_topics()
    existing_topic_ids = {t["id"] for t in topics}
    topics_changed = False
    for t in import_data:
        if t["id"] in existing_topic_ids:
            continue
        topics.append({
            "id": t["id"],
            "title": t["title"],
            "description": t["description"],
            "icon": t["icon"],
            "color": t["color"],
        })
        result.topics_created.append(t["id"])
        topics_changed = True
    if topics_changed:
        save_topics(topics)

    # 2. Levels: recorrer import y crear los que no existen
    # Re-escanear tras cada creación para que next_level_number vea los nuevos
    for t in import_data:
        topic_id = t["id"]
        for lv in t["levels"]:
            level_id = lv["id"]
            cefr = lv["difficulty"]
            existing_dirs = scan_level_dirs()
            prefix = f"{topic_id}-{level_id}-{cefr}-"
            if any(d.startswith(prefix) for d in existing_dirs):
                continue
            try:
                full_id = create_level_dir(
                    topic_id=topic_id,
                    level_id=level_id,
                    cefr=cefr,
                    title=lv["title"],
                    description=lv.get("description", ""),
                    existing_dirs=existing_dirs,
                    prompt=lv.get("prompt", ""),
                )
                result.levels_created.append(full_id)
            except Exception as e:
                result.errors.append(f"{topic_id}-{level_id}-{cefr}: {e}")

    return result
