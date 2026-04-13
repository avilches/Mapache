"""Escaneo, parseo de IDs y creación de directorios de level.

Convención de ID: {topicId}-{levelId}-{CEFR}-{N}
  - topicId y levelId: kebab-case (solo [a-z0-9-], empezar por letra)
  - CEFR: A1|A2|B1|B2|C1|C2
  - N: entero >= 1

El separador entre segmentos es `-`, igual que dentro de topicId/levelId
(kebab-case). Por eso el parseo necesita conocer los topic ids válidos
para desambiguar. Se extrae CEFR+N desde la derecha y luego se prueba
cada topic id como prefijo del resto.
"""
import json
import os
import re
from datetime import date
from typing import Optional

from .paths import CEFR_LEVELS, LEVELS_DIR

# Valida forma general: algo-CEFR-N al final
LEVEL_TAIL_RE = re.compile(r"^(?P<prefix>.+)-(?P<cefr>A1|A2|B1|B2|C1|C2)-(?P<n>\d+)$")


def parse_level_id(
    level_id: str,
    known_topic_ids: Optional[set[str]] = None,
) -> Optional[tuple[str, str, str, int]]:
    """Devuelve (topic_id, level_id, cefr, n) o None si no matchea.

    Si known_topic_ids se proporciona, desambigua el prefijo probando
    cada topic id. Si no, intenta leer topicId del meta.json del level.
    """
    m = LEVEL_TAIL_RE.match(level_id)
    if not m:
        return None
    prefix = m.group("prefix")  # topicId-levelId (sin CEFR-N)
    cefr = m.group("cefr")
    n = int(m.group("n"))

    # cargar topic ids si no se proporcionan
    if known_topic_ids is None:
        meta_path = os.path.join(LEVELS_DIR, level_id, "meta.json")
        if os.path.isfile(meta_path):
            try:
                with open(meta_path, encoding="utf-8") as f:
                    meta = json.load(f)
                tid = meta.get("topicId", "")
                if prefix.startswith(tid + "-") and len(prefix) > len(tid) + 1:
                    return (tid, prefix[len(tid) + 1:], cefr, n)
            except Exception:
                pass
        return None

    # probar cada topic id como prefijo (más largo primero para evitar falsos)
    for tid in sorted(known_topic_ids, key=len, reverse=True):
        expected = tid + "-"
        if prefix.startswith(expected) and len(prefix) > len(expected):
            lid = prefix[len(expected):]
            return (tid, lid, cefr, n)

    return None


def build_level_id(topic_id: str, level_id: str, cefr: str, n: int) -> str:
    return f"{topic_id}-{level_id}-{cefr}-{n}"


def scan_level_dirs() -> list[str]:
    """Lista los nombres de carpetas dentro de admin/levels/."""
    if not os.path.isdir(LEVELS_DIR):
        return []
    return sorted(
        d for d in os.listdir(LEVELS_DIR)
        if os.path.isdir(os.path.join(LEVELS_DIR, d))
    )


def scan_levels() -> list[dict]:
    """Devuelve lista de {id, meta} para todos los levels con meta.json."""
    out = []
    for name in scan_level_dirs():
        meta_path = os.path.join(LEVELS_DIR, name, "meta.json")
        if not os.path.exists(meta_path):
            continue
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            continue
        out.append({"id": name, "meta": meta})
    return out


def next_level_number(
    topic_id: str, level_id: str, cefr: str, existing_dirs: list[str]
) -> int:
    """Siguiente N libre para un (topic, level, cefr) dado."""
    prefix = f"{topic_id}-{level_id}-{cefr}-"
    max_n = 0
    for d in existing_dirs:
        if d.startswith(prefix):
            suffix = d[len(prefix):]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
    return max_n + 1


def create_level_dir(
    topic_id: str,
    level_id: str,
    cefr: str,
    title: str,
    description: str,
    existing_dirs: Optional[list[str]] = None,
    prompt: str = "",
    n: Optional[int] = None,
) -> str:
    """Crea admin/levels/<id>/meta.json y devuelve el id completo generado.

    Idempotencia: el caller comprueba antes si el directorio ya existe y decide
    si llamar o no. Si n se proporciona, se usa ese valor; si no, se calcula
    el siguiente N libre.
    """
    if cefr not in CEFR_LEVELS:
        raise ValueError(f"CEFR inválido: {cefr}")

    existing_dirs = existing_dirs if existing_dirs is not None else scan_level_dirs()
    if n is None:
        n = next_level_number(topic_id, level_id, cefr, existing_dirs)
    full_id = build_level_id(topic_id, level_id, cefr, n)
    level_dir = os.path.join(LEVELS_DIR, full_id)

    if os.path.exists(level_dir):
        raise FileExistsError(f"Ya existe {level_dir}")

    os.makedirs(level_dir)
    meta = {
        "id": full_id,
        "topicId": topic_id,
        "title": title,
        "description": description,
        "difficulty": cefr,
        "dateAdded": date.today().isoformat(),
    }
    if prompt:
        meta["prompt"] = prompt
    with open(os.path.join(level_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")

    return full_id


def level_has_prefix(topic_id: str, level_id: str, cefr: str, existing_dirs: list[str]) -> bool:
    prefix = f"{topic_id}-{level_id}-{cefr}-"
    return any(d.startswith(prefix) for d in existing_dirs)
