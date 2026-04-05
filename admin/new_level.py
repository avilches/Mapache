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
  Para una nueva serie: nuevo topicId + nuevo topicOrder.
"""
import json
import os
import sys
from datetime import date

LEVELS_DIR = os.path.join(os.path.dirname(__file__), "levels")


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

    meta = {
        "id": level_id,
        "topicId": "TODO",
        "topicName": "TODO",
        "topicIcon": "TODO",
        "topicColor": "#TODO",
        "topicOrder": 99,
        "title": "TODO",
        "difficulty": 1,
        "sort_order": 99,
        "dateAdded": date.today().isoformat()
    }
    with open(os.path.join(level_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    with open(os.path.join(level_dir, "phrases.txt"), "w", encoding="utf-8") as f:
        f.write("")

    print(f"Level creado: levels/{level_id}/")
    print(f"  1. Edita meta.json:")
    print(f"       - topicId: ID del topic (p.ej. 'greetings')")
    print(f"       - difficulty: 1=básico, 2=intermedio, 3=avanzado")
    print(f"       - sort_order: posición en la lista del topic (número único)")
    print(f"       - title: título descriptivo del level (p.ej. 'En el aeropuerto')")
    print(f"  2. Rellena phrases.txt con el formato: \"español\",\"english\"")
    print(f"  3. Genera el audio: python generate_audio.py {level_id}")
    print(f"  4. Sincroniza con la app: python sync_mobile.py")


if __name__ == "__main__":
    main()
