#!/usr/bin/env python3
"""
Crea el scaffold de un nuevo level.

Uso: python new_level.py <level-id>

Convención de IDs:
  <tema>-<dificultad>-<número>

  La dificultad forma parte del nombre del level (basic, interm, adv).
  El número es el orden dentro de la serie del mismo tema y dificultad.

  Ejemplos:
    greet-basic-2    → saludos, básico, segundo level
    trav-interm-1    → viajes, intermedio, primer level
    rest-adv-2       → restaurante, avanzado, segundo level
    work-basic-1     → trabajo (nuevo topic), básico, primer level

  Para añadir a una serie existente: usa el mismo topicId.
  Para una nueva serie: añade primero el topic en admin/topics.json.
"""
import json
import os
import sys
from datetime import date

LEVELS_DIR = os.path.join(os.path.dirname(__file__), "levels")
TOPICS_JSON = os.path.join(os.path.dirname(__file__), "topics.json")


def load_topic_ids() -> list[str]:
    try:
        with open(TOPICS_JSON, encoding="utf-8") as f:
            return [t["id"] for t in json.load(f)]
    except Exception:
        return []


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    level_id = sys.argv[1].strip()
    level_dir = os.path.join(LEVELS_DIR, level_id)

    if os.path.exists(level_dir):
        print(f"Error: ya existe el directorio {level_dir}")
        sys.exit(1)

    os.makedirs(level_dir)

    topic_ids = load_topic_ids()
    topic_hint = ", ".join(topic_ids) if topic_ids else "ver admin/topics.json"

    meta = {
        "id": level_id,
        "topicId": "TODO",
        "title": "TODO",
        "difficulty": 1,
        "dateAdded": date.today().isoformat()
    }
    with open(os.path.join(level_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    phrases_template = [
        {
            "es": "frase en español",
            "en": "traducción al inglés",
            "grammar_focus": "",
            "tip": ""
        }
    ]
    with open(os.path.join(level_dir, "phrases.json"), "w", encoding="utf-8") as f:
        json.dump(phrases_template, f, ensure_ascii=False, indent=2)

    print(f"Level creado: levels/{level_id}/")
    print(f"  1. Edita meta.json:")
    print(f"       - topicId: uno de [{topic_hint}]")
    print(f"       - difficulty: 1=A1 principiante, 2=A2 elemental, 3=B1 intermedio, 4=B2 intermedio alto, 5=C1 avanzado, 6=C2 maestría")
    print(f"       - title: título descriptivo del level (p.ej. 'En el aeropuerto')")
    print(f"  2. Rellena phrases.json — formato:")
    print(f'       [{{"es": "frase", "en": "phrase", "grammar_focus": "", "tip": ""}}]')
    print(f"  3. Genera el audio: python generate_audio.py {level_id}")
    print(f"  4. Sincroniza con la app: python sync_mobile.py")


if __name__ == "__main__":
    main()
