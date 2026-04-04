#!/usr/bin/env python3
"""
Crea el scaffold de un nuevo pack.

Uso: python new_pack.py <pack-id>

Ejemplo: python new_pack.py greet-4

Convención de IDs:
  - Usa el mismo themeId que los packs existentes para añadir a una serie.
  - Sufijo -1, -2, -3 indica nivel de dificultad dentro de la serie.
  - Ejemplos: greet-4, daily-2, work-1
"""
import json
import os
import sys

PACKS_DIR = os.path.join(os.path.dirname(__file__), "packs")


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    pack_id = sys.argv[1].strip()
    pack_dir = os.path.join(PACKS_DIR, pack_id)

    if os.path.exists(pack_dir):
        print(f"Error: ya existe el directorio {pack_dir}")
        sys.exit(1)

    os.makedirs(pack_dir)

    meta = {
        "id": pack_id,
        "themeId": "TODO",
        "themeName": "TODO",
        "themeIcon": "TODO",
        "themeColor": "#TODO",
        "themeOrder": 99,
        "title": "TODO",
        "difficulty": 1,
        "dateAdded": "TODO"
    }
    with open(os.path.join(pack_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    with open(os.path.join(pack_dir, "phrases.txt"), "w", encoding="utf-8") as f:
        f.write("")

    print(f"Pack creado: packs/{pack_id}/")
    print(f"  1. Edita meta.json con los datos del pack.")
    print(f"  2. Rellena phrases.txt con el formato: \"español\",\"english\"")
    print(f"  3. Genera el audio: python generate_audio.py {pack_id}")
    print(f"  4. Sincroniza con la app: python sync_mobile.py")


if __name__ == "__main__":
    main()
