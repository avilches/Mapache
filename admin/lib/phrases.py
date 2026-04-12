"""Generación de phrases.json vía Claude. Idempotente: no sobrescribe."""
import json
import os
from typing import Optional

from .claude import call_claude, extract_json
from .paths import LEVELS_DIR
from .topics import get_topic

DEFAULT_N_PHRASES = 20

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


class PhrasesResult:
    def __init__(self, status: str, count: int = 0, message: str = ""):
        self.status = status  # "created" | "skipped" | "error"
        self.count = count
        self.message = message


def _build_prompt(meta: dict, topic: Optional[dict], n: int) -> str:
    level_context = meta.get("prompt") or meta.get("description", "")
    tema = (
        f"Topic: {topic['title'] if topic else meta.get('topicId', '')} — "
        f"{(topic or {}).get('description', '')}\n"
        f"Level: {meta['title']} — {level_context}"
    )
    cefr = meta["difficulty"]
    return PHRASES_PROMPT_TEMPLATE.format(
        n=n,
        cefr=cefr,
        cefr_desc=CEFR_DESC[cefr],
        tema=tema,
    )


def generate_phrases_for_level(
    level_id: str,
    topics: list[dict],
    n: int = DEFAULT_N_PHRASES,
) -> PhrasesResult:
    """Escribe phrases.json para un level. Idempotente: skip si ya existe."""
    level_dir = os.path.join(LEVELS_DIR, level_id)
    meta_path = os.path.join(level_dir, "meta.json")
    phrases_path = os.path.join(level_dir, "phrases.json")

    if not os.path.isfile(meta_path):
        return PhrasesResult("error", 0, "no se encuentra meta.json")
    if os.path.isfile(phrases_path):
        return PhrasesResult("skipped", 0, "phrases.json ya existe")

    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)

    topic = get_topic(topics, meta.get("topicId", ""))
    prompt = _build_prompt(meta, topic, n)
    try:
        raw = call_claude(prompt, f"[{level_id}] Generando {n} frases…")
    except RuntimeError as e:
        return PhrasesResult("error", 0, str(e))

    try:
        phrases = extract_json(raw)
    except Exception as e:
        return PhrasesResult("error", 0, f"JSON inválido: {e}")

    if not isinstance(phrases, list) or not phrases:
        return PhrasesResult("error", 0, "Claude no devolvió un array de frases")

    normalized = []
    for p in phrases:
        if not isinstance(p, dict) or "es" not in p or "en" not in p:
            return PhrasesResult("error", 0, f"frase inválida: {p}")
        normalized.append({
            "es": str(p["es"]).strip(),
            "en": str(p["en"]).strip(),
            "grammar_focus": str(p.get("grammar_focus", "")).strip(),
            "tip": str(p.get("tip", "")).strip(),
        })

    with open(phrases_path, "w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)
        f.write("\n")

    return PhrasesResult("created", len(normalized), "")
