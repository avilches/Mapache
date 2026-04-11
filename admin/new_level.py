#!/usr/bin/env python3
"""
Crea un nuevo level de forma interactiva.

Flujo:
  1. Elegir topic (de topics.json) o crear uno nuevo. Si es nuevo, Claude
     sugiere icon + color y se añade a topics.json.
  2. Elegir CEFR, opcionalmente reutilizar metadata de un level existente,
     editar título.
  3. Pedir N frases a Claude con un prompt parametrizado y escribir
     meta.json + phrases.json en admin/levels/<level_id>/.

Uso: python new_level.py

Requiere: pip install -r requirements.txt
Requiere también el binario `claude` en PATH.
"""
import json
import os
import re
import subprocess
import sys
from datetime import date

import questionary
from rich.console import Console

# ── paths ────────────────────────────────────────────────────────────────────

HERE = os.path.dirname(os.path.abspath(__file__))
LEVELS_DIR = os.path.join(HERE, "levels")
TOPICS_JSON = os.path.join(HERE, "topics.json")

CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

# Paleta solarizada — coincide con los colores usados en topics.json actuales
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

CEFR_DESC = {
    "A1": "frases muy cortas (3-5 palabras), presente simple, vocabulario de las 500 palabras más comunes en inglés. Sin contracciones. Sin phrasal verbs.",
    "A2": "frases cortas (5-8 palabras), presente simple y pasado simple, vocabulario básico cotidiano (~1000 palabras). Contracciones simples permitidas. Phrasal verbs muy comunes (go out, get up).",
    "B1": "frases de longitud media (7-12 palabras), mezcla de tiempos (presente perfecto, futuro con will/going to, condicional 1), vocabulario intermedio (~2000 palabras). Phrasal verbs habituales.",
    "B2": "frases naturales (10-15 palabras), todos los tiempos verbales incluidos pasiva y condicionales 2 y 3, conectores avanzados, vocabulario abstracto. Phrasal verbs menos comunes y colocaciones.",
    "C1": "frases complejas con subordinación, estructuras idiomáticas, vocabulario preciso y matices, estilo formal e informal. Phrasal verbs avanzados y expresiones fijas.",
    "C2": "frases sofisticadas con registro cuidado, matices sutiles, vocabulario rico incluyendo términos literarios o técnicos, estructuras infrecuentes. Modismos nativos.",
}

PHRASES_PROMPT_TEMPLATE = """Eres un experto en enseñanza de inglés para hispanohablantes. Tu tarea es generar {n} frases en español diseñadas para que el estudiante las traduzca al inglés.

NIVEL DEL ESTUDIANTE: {cefr}
Características para este nivel: {cefr_desc}

TEMA: {tema}

REGLAS CRÍTICAS para las frases en español:
1. EVITAR cognados exactos — no uses palabras cuya traducción sea obvia (información→information, televisión→television). El estudiante no aprende nada con eso.
2. EVITAR modismos intraducibles o muy locales del español — la frase debe tener una traducción clara y única al inglés.
3. PRIORIZAR estructuras donde español e inglés difieren: orden de adjetivos, uso de artículos, verbos con preposición diferente, tiempos verbales con distinto uso.
4. Las frases deben sonar naturales en español cotidiano, no forzadas.
5. Cada frase debe ejercitar UN concepto gramatical específico del nivel indicado.
6. La traducción al inglés debe ser natural y la más común, sin ser literal.

RESPONDE ÚNICAMENTE con un array JSON válido, sin texto adicional, sin backticks, sin comentarios:
[
  {{
    "es": "frase en español",
    "en": "traducción natural al inglés",
    "grammar_focus": "concepto gramatical en español (ej: 'presente perfecto', 'phrasal verb: look for')",
    "tip": "nota breve en español sobre por qué esta frase es tricky (max 12 palabras)"
  }}
]
"""

TOPIC_PROMPT_TEMPLATE = """Dado un topic de una app para aprender inglés con id="{id}" y name="{name}", devuelve SOLO un objeto JSON válido (sin backticks, sin texto extra) con dos campos:
- "icon": nombre de un icono de Ionicons en formato "xxxx-outline" (ej: "airplane-outline", "restaurant-outline", "briefcase-outline") que represente bien el topic.
- "color": un color hex EXACTO de esta paleta solarizada: #b58900, #cb4b16, #dc322f, #d33682, #6c71c4, #268bd2, #2aa198, #859900.

Ejemplo de salida: {{"icon":"airplane-outline","color":"#859900"}}
"""

console = Console()


# ── claude subprocess ───────────────────────────────────────────────────────

def call_claude(prompt: str, status_msg: str) -> str:
    """Llama a `claude -p --bare <prompt>` y devuelve stdout."""
    with console.status(f"[cyan]{status_msg}[/cyan]"):
        try:
            result = subprocess.run(
                ["claude", "-p", "--bare", prompt],
                capture_output=True,
                text=True,
                check=True,
            )
        except FileNotFoundError:
            console.print("[red]Error:[/red] no se encuentra el binario `claude` en el PATH.")
            sys.exit(1)
        except subprocess.CalledProcessError as e:
            console.print(f"[red]Claude falló con exit code {e.returncode}[/red]")
            console.print(f"[dim]stderr:[/dim] {e.stderr}")
            sys.exit(1)
    return result.stdout.strip()


def extract_json(raw: str):
    """Parsea JSON tolerando backticks o prefijos/sufijos accidentales."""
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE)
    start_obj = cleaned.find("{")
    start_arr = cleaned.find("[")
    candidates = [x for x in (start_obj, start_arr) if x >= 0]
    if not candidates:
        raise ValueError("no se encontró JSON en la respuesta")
    start = min(candidates)
    end = max(cleaned.rfind("}"), cleaned.rfind("]"))
    if end < start:
        raise ValueError("JSON mal formado")
    return json.loads(cleaned[start : end + 1])


# ── topics ──────────────────────────────────────────────────────────────────

def load_topics() -> list[dict]:
    with open(TOPICS_JSON, encoding="utf-8") as f:
        return json.load(f)


def save_topics(topics: list[dict]) -> None:
    with open(TOPICS_JSON, "w", encoding="utf-8") as f:
        json.dump(topics, f, ensure_ascii=False, indent=2)
        f.write("\n")


def choose_or_create_topic(topics: list[dict]) -> dict:
    choices = [
        questionary.Choice(title=f"{t['name']}  ({t['id']})", value=t["id"])
        for t in topics
    ] + [questionary.Choice(title="➕ Crear nuevo topic", value="__new__")]

    selection = questionary.select(
        "¿A qué topic pertenece el level?",
        choices=choices,
    ).ask()
    if selection is None:
        sys.exit(0)

    if selection != "__new__":
        return next(t for t in topics if t["id"] == selection)

    return create_new_topic(topics)


def create_new_topic(topics: list[dict]) -> dict:
    existing_ids = {t["id"] for t in topics}

    def validate_id(value: str):
        value = value.strip()
        if not re.match(r"^[a-z][a-z0-9-]*$", value):
            return "Usa solo letras minúsculas, dígitos y guiones. Debe empezar por letra."
        if value in existing_ids:
            return f"Ya existe un topic con id '{value}'."
        return True

    topic_id = questionary.text("ID del topic (kebab-case):", validate=validate_id).ask()
    if topic_id is None:
        sys.exit(0)
    topic_id = topic_id.strip()

    topic_name = questionary.text(
        "Nombre visible del topic (ej: 'Trabajo'):",
        validate=lambda v: bool(v.strip()) or "No puede estar vacío",
    ).ask()
    if topic_name is None:
        sys.exit(0)
    topic_name = topic_name.strip()

    raw = call_claude(
        TOPIC_PROMPT_TEMPLATE.format(id=topic_id, name=topic_name),
        "Pidiendo a Claude icon y color para el topic…",
    )

    icon = ""
    color = ""
    try:
        parsed = extract_json(raw)
        icon = str(parsed.get("icon", "")).strip()
        color = str(parsed.get("color", "")).strip().lower()
    except Exception as e:
        console.print(f"[yellow]No pude parsear la respuesta de Claude:[/yellow] {e}")
        console.print(f"[dim]{raw}[/dim]")

    if not icon.endswith("-outline"):
        console.print(f"[yellow]Icon inválido ('{icon}'). Introdúcelo a mano.[/yellow]")
        icon = (
            questionary.text(
                "Icon de Ionicons (debe acabar en '-outline'):",
                validate=lambda v: v.strip().endswith("-outline") or "Debe terminar en '-outline'",
            ).ask()
            or ""
        ).strip()

    if color not in SOLARIZED_PALETTE:
        console.print(f"[yellow]Color '{color}' no está en la paleta. Elige uno:[/yellow]")
        color = questionary.select("Color (paleta solarizada):", choices=SOLARIZED_PALETTE).ask()
        if color is None:
            sys.exit(0)

    new_topic = {"id": topic_id, "name": topic_name, "icon": icon, "color": color}
    topics.append(new_topic)
    save_topics(topics)
    console.print(f"[green]✓ Topic '{topic_id}' añadido a topics.json[/green]")
    console.print(
        "[dim]  Recuerda correr sync_mobile.py después para que los levels del topic "
        "lleven topic.json en el ZIP.[/dim]"
    )
    return new_topic


# ── levels helpers ──────────────────────────────────────────────────────────

def scan_levels() -> list[dict]:
    """Devuelve lista de {id, meta} para todos los levels existentes."""
    out = []
    if not os.path.isdir(LEVELS_DIR):
        return out
    for name in sorted(os.listdir(LEVELS_DIR)):
        level_dir = os.path.join(LEVELS_DIR, name)
        meta_path = os.path.join(level_dir, "meta.json")
        if not os.path.isdir(level_dir) or not os.path.exists(meta_path):
            continue
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            continue
        out.append({"id": name, "meta": meta})
    return out


def next_level_number(topic_id: str, cefr: str, all_levels: list[dict]) -> int:
    prefix = f"{topic_id}-{cefr}-"
    max_n = 0
    for lv in all_levels:
        if lv["id"].startswith(prefix):
            suffix = lv["id"][len(prefix):]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
    return max_n + 1


# ── main flow ────────────────────────────────────────────────────────────────

def main():
    console.print("[bold cyan]Nuevo level[/bold cyan]\n")

    topics = load_topics()
    topic = choose_or_create_topic(topics)

    cefr = questionary.select("Dificultad CEFR:", choices=CEFR_LEVELS).ask()
    if cefr is None:
        sys.exit(0)

    all_levels = scan_levels()

    reuse_choices = [questionary.Choice(title="➕ Empezar en blanco", value="__blank__")] + [
        questionary.Choice(
            title=f"{lv['id']}  — {lv['meta'].get('title', '(sin título)')}",
            value=lv["id"],
        )
        for lv in all_levels
    ]
    reuse_choice = questionary.select(
        "¿Reutilizar metadata de otro level como plantilla?",
        choices=reuse_choices,
    ).ask()
    if reuse_choice is None:
        sys.exit(0)

    default_title = ""
    if reuse_choice != "__blank__":
        template = next(lv for lv in all_levels if lv["id"] == reuse_choice)
        default_title = template["meta"].get("title", "")

    title = questionary.text(
        "Título del level:",
        default=default_title,
        validate=lambda v: bool(v.strip()) or "No puede estar vacío",
    ).ask()
    if title is None:
        sys.exit(0)
    title = title.strip()

    n = next_level_number(topic["id"], cefr, all_levels)
    level_id = f"{topic['id']}-{cefr}-{n}"
    level_dir = os.path.join(LEVELS_DIR, level_id)

    if os.path.exists(level_dir):
        console.print(f"[red]Error:[/red] ya existe {level_dir}")
        sys.exit(1)

    console.print()
    console.print("[bold]Resumen[/bold]")
    console.print(f"  id:         {level_id}")
    console.print(f"  topicId:    {topic['id']}  ({topic['name']})")
    console.print(f"  title:      {title}")
    console.print(f"  difficulty: {cefr}")
    console.print()
    if not questionary.confirm("¿Continuar y generar frases?", default=True).ask():
        sys.exit(0)

    def validate_n(v: str):
        try:
            return int(v) > 0 or "Debe ser > 0"
        except ValueError:
            return "Introduce un número entero"

    n_phrases_str = questionary.text(
        "¿Cuántas frases generar?", default="10", validate=validate_n
    ).ask()
    if n_phrases_str is None:
        sys.exit(0)
    n_phrases = int(n_phrases_str)

    tema = f"{topic['name']} — {title}"
    prompt = PHRASES_PROMPT_TEMPLATE.format(
        n=n_phrases,
        cefr=cefr,
        cefr_desc=CEFR_DESC[cefr],
        tema=tema,
    )
    raw = call_claude(prompt, f"Generando {n_phrases} frases con Claude…")

    try:
        phrases = extract_json(raw)
    except Exception as e:
        console.print(f"[red]No pude parsear la respuesta de Claude:[/red] {e}")
        console.print("[dim]--- salida cruda ---[/dim]")
        console.print(raw)
        sys.exit(1)

    if not isinstance(phrases, list) or not phrases:
        console.print("[red]Claude no devolvió un array de frases válido.[/red]")
        console.print(raw)
        sys.exit(1)

    normalized = []
    for p in phrases:
        if not isinstance(p, dict) or "es" not in p or "en" not in p:
            console.print(f"[red]Frase inválida:[/red] {p}")
            sys.exit(1)
        normalized.append(
            {
                "es": str(p["es"]).strip(),
                "en": str(p["en"]).strip(),
                "grammar_focus": str(p.get("grammar_focus", "")).strip(),
                "tip": str(p.get("tip", "")).strip(),
            }
        )

    os.makedirs(level_dir)
    meta = {
        "id": level_id,
        "topicId": topic["id"],
        "title": title,
        "difficulty": cefr,
        "dateAdded": date.today().isoformat(),
    }
    with open(os.path.join(level_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")

    with open(os.path.join(level_dir, "phrases.json"), "w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)
        f.write("\n")

    console.print()
    console.print(f"[green]✓ Level creado: levels/{level_id}/[/green]")
    console.print(f"  meta.json + phrases.json ({len(normalized)} frases)")
    console.print()
    console.print("[bold]Siguientes pasos:[/bold]")
    console.print("  1. Revisa phrases.json (Claude puede haberse equivocado).")
    console.print(f"  2. python generate_audio.py {level_id}")
    console.print("  3. python sync_mobile.py")


if __name__ == "__main__":
    main()
