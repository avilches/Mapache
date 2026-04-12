"""Carga/guardado de topics.json y sugerencia de icon+color vía Claude."""
import json
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
