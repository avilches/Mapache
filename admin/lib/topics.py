"""Carga/guardado de topics.json y sugerencia de icon+color vía Claude."""
import json
import os
from typing import Optional

from .claude import call_claude, extract_json
from .paths import SOLARIZED_PALETTE, TOPICS_JSON

TOPIC_PROMPT_TEMPLATE = """Dado un topic de una app para aprender inglés con id="{id}" y title="{title}", devuelve SOLO un objeto JSON válido (sin backticks, sin texto extra) con dos campos:
- "icon": nombre de un icono de Ionicons en formato "xxxx-outline" (ej: "airplane-outline", "restaurant-outline", "briefcase-outline") que represente bien el topic.
- "color": un color hex EXACTO de esta paleta solarizada: #b58900, #cb4b16, #dc322f, #d33682, #6c71c4, #268bd2, #2aa198, #859900.

Ejemplo de salida: {{"icon":"airplane-outline","color":"#859900"}}
"""


def load_topics() -> list[dict]:
    try:
        with open(TOPICS_JSON, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return []
    return data if isinstance(data, list) else []


def save_topics(topics: list[dict]) -> None:
    with open(TOPICS_JSON, "w", encoding="utf-8") as f:
        json.dump(topics, f, ensure_ascii=False, indent=2)
        f.write("\n")


def rebuild_topics_from_sources(
    import_data: Optional[list],
    levels_dir: str,
) -> list[str]:
    """Reconstruye topics.json añadiendo los topics que falten.

    Fuentes (en orden de prioridad):
      1. import.json — metadata completa (icon, color, title, description)
      2. meta.json de levels en disco — solo topicId; se añade con metadata
         mínima si no aparece en import.json

    No elimina ningún topic existente.
    Devuelve la lista de ids añadidos.
    """
    topics = load_topics()
    existing_ids = {t["id"] for t in topics}
    added: list[str] = []

    # 1. Topics de import.json
    if import_data:
        for t in import_data:
            tid = t.get("id", "")
            if tid and tid not in existing_ids:
                topics.append({k: v for k, v in t.items() if k != "levels"})
                existing_ids.add(tid)
                added.append(tid)

    # 2. topicIds en meta.json de levels existentes no cubiertos por import.json
    if os.path.isdir(levels_dir):
        for dir_name in sorted(os.listdir(levels_dir)):
            meta_path = os.path.join(levels_dir, dir_name, "meta.json")
            if not os.path.isfile(meta_path):
                continue
            try:
                with open(meta_path, encoding="utf-8") as f:
                    meta = json.load(f)
                tid = meta.get("topicId", "").strip()
                if tid and tid not in existing_ids:
                    topics.append({"id": tid, "title": tid, "description": "", "icon": "", "color": ""})
                    existing_ids.add(tid)
                    added.append(tid)
            except Exception:
                pass

    if added:
        save_topics(topics)
    return added


def get_topic(topics: list[dict], topic_id: str) -> Optional[dict]:
    return next((t for t in topics if t.get("id") == topic_id), None)


def suggest_topic_icon_color(topic_id: str, title: str) -> tuple[str, str]:
    """Pide a Claude un icon + color para un topic nuevo.

    Devuelve (icon, color). Si la respuesta es inválida devuelve ("", "")
    para que el caller pida input manual.
    """
    raw = call_claude(
        TOPIC_PROMPT_TEMPLATE.format(id=topic_id, title=title),
        "Pidiendo a Claude icon y color para el topic…",
    )
    try:
        parsed = extract_json(raw)
        icon = str(parsed.get("icon", "")).strip()
        color = str(parsed.get("color", "")).strip().lower()
    except Exception:
        return "", ""

    if not icon.endswith("-outline"):
        icon = ""
    if color not in SOLARIZED_PALETTE:
        color = ""
    return icon, color
