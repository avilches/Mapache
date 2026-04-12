"""Rutas compartidas por todos los módulos de admin."""
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # admin/
LEVELS_DIR = os.path.join(HERE, "levels")
TOPICS_JSON = os.path.join(HERE, "topics.json")
IMPORT_JSON = os.path.join(HERE, "import.json")
VALIDATE_SCRIPT = os.path.join(HERE, "validate_levels.py")

ROOT = os.path.dirname(HERE)  # Mapache/
MOBILE_DIR = os.path.join(ROOT, "mobile")
ASSETS_LEVELS_OUT = os.path.join(MOBILE_DIR, "assets", "levels")
APP_STORE_TS = os.path.join(MOBILE_DIR, "src", "store", "appStore.ts")

CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

# Paleta solarizada
SOLARIZED_PALETTE = [
    "#b58900",  # yellow
    "#cb4b16",  # orange
    "#dc322f",  # red
    "#d33682",  # magenta
    "#6c71c4",  # violet
    "#268bd2",  # blue
    "#2aa198",  # cyan
    "#859900",  # green
]
