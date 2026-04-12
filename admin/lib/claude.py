"""Llamadas al binario `claude` y parseo tolerante de JSON."""
import json
import re
import subprocess
import sys

from rich.console import Console

_console = Console()


def call_claude(prompt: str, status_msg: str) -> str:
    """Llama a `claude -p --bare <prompt>` y devuelve stdout."""
    with _console.status(f"[cyan]{status_msg}[/cyan]"):
        try:
            result = subprocess.run(
                ["claude", "-p", "--bare", prompt],
                capture_output=True,
                text=True,
                check=True,
            )
        except FileNotFoundError:
            _console.print("[red]Error:[/red] no se encuentra el binario `claude` en el PATH.")
            sys.exit(1)
        except subprocess.CalledProcessError as e:
            _console.print(f"[red]Claude falló con exit code {e.returncode}[/red]")
            _console.print(f"[dim]stderr:[/dim] {e.stderr}")
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
