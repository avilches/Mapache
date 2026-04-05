#!/usr/bin/env python3
"""
Crea el scaffold de un nuevo pack.

Uso: python new_pack.py <pack-id>

Convención de IDs:
  <tema>-<dificultad>-<número>

  La dificultad forma parte del nombre del pack (basic, interm, adv).
  El número es el orden dentro de la serie del mismo tema y dificultad.

  Ejemplos:
    greet-basic-2    → saludos, básico, segundo pack
    trav-interm-1    → viajes, intermedio, primer pack
    rest-adv-2       → restaurante, avanzado, segundo pack
    work-basic-1     → trabajo (nuevo tema), básico, primer pack

  Para añadir a una serie existente: usa el mismo themeId.
  Para una nueva serie: nuevo themeId + nuevo themeOrder.
"""
import json
import os
import sys
from datetime import date

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
        "sort_order": 99,
        "dateAdded": date.today().isoformat()
    }
    with open(os.path.join(pack_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    with open(os.path.join(pack_dir, "phrases.txt"), "w", encoding="utf-8") as f:
        f.write("")

    print(f"Pack creado: packs/{pack_id}/")
    print(f"  1. Edita meta.json:")
    print(f"       - themeId: ID del tema (p.ej. 'greetings')")
    print(f"       - difficulty: 1=básico, 2=intermedio, 3=avanzado")
    print(f"       - sort_order: posición en la lista del tema (número único)")
    print(f"       - title: título descriptivo del pack (p.ej. 'En el aeropuerto')")
    print(f"  2. Rellena phrases.txt con el formato: \"español\",\"english\"")
    print(f"  3. Genera el audio: python generate_audio.py {pack_id}")
    print(f"  4. Sincroniza con la app: python sync_mobile.py")


if __name__ == "__main__":
    main()
