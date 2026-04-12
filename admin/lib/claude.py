"""Llamadas a LLM vía LiteLLM y parseo tolerante de JSON."""
import json
import os
import re

from dotenv import load_dotenv
from rich.console import Console
import litellm

# Cargar .env desde admin/
_HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_HERE, os.pardir, ".env"))

_console = Console()

DEFAULT_MODEL = "claude-sonnet-4-20250514"

# Silenciar logs internos de litellm
litellm.suppress_debug_info = True


def call_claude(prompt: str, status_msg: str) -> str:
    """Llama al modelo configurado en MODEL (env) y devuelve el texto."""
    model = os.environ.get("PHRASES_MODEL", DEFAULT_MODEL)
    with _console.status(f"[cyan]{status_msg}[/cyan]  [dim]({model})[/dim]"):
        try:
            response = litellm.completion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
            )
        except Exception as e:
            raise RuntimeError(f"LLM error ({model}): {e}") from e
    return response.choices[0].message.content.strip()


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
