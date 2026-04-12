#!/usr/bin/env python3
"""
admin.py — entrypoint único de mantenimiento para admin/.

Muestra el estado del sistema y ofrece acciones idempotentes:
  1. Importar levels desde import.json
  2. Crear level nuevo (interactivo)
  3. Generar frases faltantes
  4. Generar audio faltante
  5. Sync mobile (ZIPs + BUNDLED_ZIPS)
  6. Validar (invoca validate_levels.py)

Uso: python3 admin/admin.py
Requiere: pip install -r requirements.txt y el binario `claude` en PATH (para
          generación de frases y sugerencia de icon/color de topics nuevos).
"""
import os
import re
import subprocess
import sys

import questionary
from rich.console import Console
from rich.table import Table

# Soporta ejecución desde admin/ y desde la raíz del proyecto
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)

from lib import state as st_mod  # noqa: E402
from lib.audio import generate_audio_for_level  # noqa: E402
from lib.importer import apply_import, load_import_json  # noqa: E402
from lib.levels import create_level_dir, scan_level_dirs  # noqa: E402
from lib.paths import (  # noqa: E402
    CEFR_LEVELS,
    IMPORT_JSON,
    SOLARIZED_PALETTE,
    VALIDATE_SCRIPT,
)
from lib.phrases import DEFAULT_N_PHRASES, generate_phrases_for_level  # noqa: E402
from lib.sync import sync_mobile  # noqa: E402
from lib.topics import (  # noqa: E402
    get_topic,
    load_topics,
    save_topics,
    suggest_topic_icon_color,
)

console = Console()

STATUS_COLORS = {
    st_mod.ST_COMPLETE: "green",
    st_mod.ST_NO_META: "red",
    st_mod.ST_INVALID_ID: "red",
    st_mod.ST_NO_PHRASES: "yellow",
    st_mod.ST_AUDIO_PARTIAL: "yellow",
    st_mod.ST_AUDIO_ORPHANS: "magenta",
}

STATUS_LABELS = {
    st_mod.ST_COMPLETE: "completo",
    st_mod.ST_NO_META: "sin meta",
    st_mod.ST_INVALID_ID: "id inválido",
    st_mod.ST_NO_PHRASES: "sin frases",
    st_mod.ST_AUDIO_PARTIAL: "audio parcial",
    st_mod.ST_AUDIO_ORPHANS: "mp3 huérfanos",
}


# ── rendering ───────────────────────────────────────────────────────────────

def _load_import_safe():
    try:
        return load_import_json()
    except FileNotFoundError:
        return None
    except Exception as e:
        console.print(f"[yellow]No se pudo leer import.json:[/yellow] {e}")
        return None


def print_state(state: dict) -> None:
    s = state["summary"]
    header = (
        f"[bold cyan]Estado[/bold cyan]  "
        f"levels: [b]{s['levels_total']}[/b] · "
        f"completos: [green]{s['levels_complete']}[/green] · "
        f"sin frases: [yellow]{s['levels_without_phrases']}[/yellow] · "
        f"mp3 faltantes: [yellow]{s['missing_mp3_total']}[/yellow]"
    )
    console.print()
    console.print(header)

    topics_known = state["topics"]["known"]
    topics_used = state["topics"]["used_by_levels"]
    topics_unused = sorted(set(topics_known) - set(topics_used))
    console.print(
        f"[dim]topics.json:[/dim] {len(topics_known)}  "
        f"[dim]usados:[/dim] {len(topics_used)}  "
        f"[dim]sin levels:[/dim] {len(topics_unused)}"
    )

    if state["import_diff"] is not None:
        d = state["import_diff"]
        console.print(
            f"[dim]import.json:[/dim] "
            f"{len(d['topics_to_create'])} topics nuevos · "
            f"{len(d['levels_to_create'])} levels nuevos · "
            f"{d['levels_already_ok']} ya existen"
        )

    if state["levels"]:
        table = Table(show_header=True, header_style="bold", box=None, padding=(0, 1))
        table.add_column("id")
        table.add_column("frases", justify="right")
        table.add_column("mp3", justify="right")
        table.add_column("status")
        for lv in state["levels"]:
            color = STATUS_COLORS.get(lv["status"], "white")
            status_text = STATUS_LABELS.get(lv["status"], lv["status"])
            if lv["status"] == st_mod.ST_AUDIO_PARTIAL and lv["missing_audio_indices"]:
                status_text += f" (falta {len(lv['missing_audio_indices'])})"
            if lv["orphan_mp3s"]:
                status_text += f" [huérfanos: {len(lv['orphan_mp3s'])}]"
            table.add_row(
                lv["id"],
                str(lv["phrase_count"]),
                str(lv["mp3_count"]),
                f"[{color}]{status_text}[/{color}]",
            )
        console.print(table)
    else:
        console.print("[dim](no hay levels en admin/levels/)[/dim]")
    console.print()


# ── action: import ──────────────────────────────────────────────────────────

def action_import(state: dict) -> None:
    diff = state["import_diff"]
    if diff is None:
        console.print("[yellow]No hay import.json.[/yellow]")
        return

    if not diff["topics_to_create"] and not diff["levels_to_create"]:
        console.print("[green]Nada que importar: todo está al día.[/green]")
        return

    console.print(f"[bold]Se crearán:[/bold]")
    console.print(f"  topics: {len(diff['topics_to_create'])}")
    for t in diff["topics_to_create"]:
        console.print(f"    + {t['id']}  ({t['title']})")
    console.print(f"  levels: {len(diff['levels_to_create'])}")
    for lv in diff["levels_to_create"][:20]:
        console.print(f"    + {lv['topic_id']}-{lv['level_id']}-{lv['cefr']}  ({lv['title']})")
    if len(diff["levels_to_create"]) > 20:
        console.print(f"    … y {len(diff['levels_to_create']) - 20} más")

    if not questionary.confirm("¿Confirmar?", default=True).ask():
        return

    result = apply_import()
    console.print(
        f"[green]✓[/green] topics creados: {len(result.topics_created)}, "
        f"levels creados: {len(result.levels_created)}"
    )
    for e in result.errors:
        console.print(f"  [red]✗[/red] {e}")


# ── action: create level interactively ─────────────────────────────────────

def _validate_id(value: str, existing: set[str]) -> "bool | str":
    value = value.strip()
    if not re.match(r"^[a-z][a-z0-9_]*$", value):
        return "Usa solo letras minúsculas, dígitos y _. Debe empezar por letra."
    if value in existing:
        return f"Ya existe '{value}'."
    return True


def _create_topic_interactive() -> "dict | None":
    topics = load_topics()
    existing = {t["id"] for t in topics}

    topic_id = questionary.text(
        "ID del topic (snake_case):",
        validate=lambda v: _validate_id(v, existing),
    ).ask()
    if topic_id is None:
        return None
    topic_id = topic_id.strip()

    title = questionary.text(
        "Título visible:",
        validate=lambda v: bool(v.strip()) or "No puede estar vacío",
    ).ask()
    if title is None:
        return None
    title = title.strip()

    description = questionary.text(
        "Descripción (1 frase):",
        validate=lambda v: bool(v.strip()) or "No puede estar vacío",
    ).ask()
    if description is None:
        return None
    description = description.strip()

    icon, color = suggest_topic_icon_color(topic_id, title)
    if not icon:
        console.print("[yellow]Icon inválido, introdúcelo a mano.[/yellow]")
        icon = questionary.text(
            "Icon de Ionicons (debe acabar en '-outline'):",
            validate=lambda v: v.strip().endswith("-outline") or "Debe terminar en '-outline'",
        ).ask()
        if icon is None:
            return None
        icon = icon.strip()
    if not color:
        color = questionary.select("Color:", choices=SOLARIZED_PALETTE).ask()
        if color is None:
            return None

    new_topic = {
        "id": topic_id,
        "title": title,
        "description": description,
        "icon": icon,
        "color": color,
    }
    topics.append(new_topic)
    save_topics(topics)
    console.print(f"[green]✓[/green] Topic '{topic_id}' añadido a topics.json")
    return new_topic


def action_create_level() -> None:
    topics = load_topics()
    choices = [
        questionary.Choice(title=f"{t['title']}  ({t['id']})", value=t["id"])
        for t in topics
    ] + [questionary.Choice(title="➕ Crear nuevo topic", value="__new__")]

    if not choices:
        choices = [questionary.Choice(title="➕ Crear nuevo topic", value="__new__")]

    sel = questionary.select("Topic:", choices=choices).ask()
    if sel is None:
        return
    if sel == "__new__":
        topic = _create_topic_interactive()
        if topic is None:
            return
    else:
        topic = get_topic(topics, sel)

    cefr = questionary.select("Dificultad CEFR:", choices=CEFR_LEVELS).ask()
    if cefr is None:
        return

    existing_dirs = scan_level_dirs()

    # level_id dentro del topic
    existing_level_ids_for_topic = {
        d.split("-", 2)[1]
        for d in existing_dirs
        if d.startswith(f"{topic['id']}-") and d.count("-") >= 3
    }

    def _val(v):
        v = v.strip()
        if not re.match(r"^[a-z][a-z0-9_]*$", v):
            return "snake_case: solo [a-z0-9_], empezar por letra"
        return True

    level_id = questionary.text("levelId (snake_case, único dentro del topic):", validate=_val).ask()
    if level_id is None:
        return
    level_id = level_id.strip()

    title = questionary.text(
        "Título:",
        validate=lambda v: bool(v.strip()) or "No puede estar vacío",
    ).ask()
    if title is None:
        return
    title = title.strip()

    description = questionary.text(
        "Descripción (1 frase):",
        validate=lambda v: bool(v.strip()) or "No puede estar vacío",
    ).ask()
    if description is None:
        return
    description = description.strip()

    try:
        full_id = create_level_dir(
            topic_id=topic["id"],
            level_id=level_id,
            cefr=cefr,
            title=title,
            description=description,
            existing_dirs=existing_dirs,
        )
        console.print(f"[green]✓[/green] Level creado: {full_id}")
    except Exception as e:
        console.print(f"[red]✗[/red] {e}")


# ── action: generate phrases ────────────────────────────────────────────────

def action_generate_phrases(state: dict) -> None:
    pending = [lv for lv in state["levels"] if lv["status"] == st_mod.ST_NO_PHRASES]
    if not pending:
        console.print("[green]No hay levels sin frases.[/green]")
        return

    choices = [
        questionary.Choice(
            title=f"{lv['id']}  — {lv['title']}",
            value=lv["id"],
            checked=True,
        )
        for lv in pending
    ]
    selected = questionary.checkbox(
        f"Selecciona levels para generar frases (N={DEFAULT_N_PHRASES} por level):",
        choices=choices,
    ).ask()
    if not selected:
        return

    topics = load_topics()
    for level_id in selected:
        res = generate_phrases_for_level(level_id, topics, n=DEFAULT_N_PHRASES)
        if res.status == "created":
            console.print(f"  [green]✓[/green] {level_id}: {res.count} frases")
        elif res.status == "skipped":
            console.print(f"  [dim]-[/dim] {level_id}: {res.message}")
        else:
            console.print(f"  [red]✗[/red] {level_id}: {res.message}")


# ── action: generate audio ──────────────────────────────────────────────────

def action_generate_audio(state: dict) -> None:
    pending = [
        lv for lv in state["levels"]
        if lv["status"] == st_mod.ST_AUDIO_PARTIAL
        or (lv["has_phrases"] and lv["mp3_count"] == 0)
    ]
    if not pending:
        console.print("[green]No hay audio faltante.[/green]")
        return

    choices = [
        questionary.Choice(
            title=f"{lv['id']}  — faltan {len(lv['missing_audio_indices']) or lv['phrase_count']} mp3",
            value=lv["id"],
            checked=True,
        )
        for lv in pending
    ]
    selected = questionary.checkbox("Selecciona levels:", choices=choices).ask()
    if not selected:
        return

    for level_id in selected:
        console.print(f"[cyan]→[/cyan] {level_id}")
        res = generate_audio_for_level(level_id)
        if res.error:
            console.print(f"  [red]✗[/red] {res.error}")
            continue
        console.print(
            f"  [green]{len(res.generated)} generados[/green], "
            f"{len(res.skipped)} saltados"
            + (f", [magenta]{len(res.orphan_mp3s)} huérfanos[/magenta]" if res.orphan_mp3s else "")
        )


# ── action: sync mobile ─────────────────────────────────────────────────────

def action_sync(state: dict) -> None:
    complete = [lv["id"] for lv in state["levels"] if lv["status"] == st_mod.ST_COMPLETE]
    incomplete = [lv for lv in state["levels"] if lv["status"] != st_mod.ST_COMPLETE]

    if incomplete:
        console.print(f"[yellow]Aviso:[/yellow] {len(incomplete)} level(s) incompletos no se sincronizarán:")
        for lv in incomplete:
            console.print(f"  [dim]·[/dim] {lv['id']} ({STATUS_LABELS[lv['status']]})")

    if not complete:
        console.print("[yellow]No hay levels completos para sincronizar.[/yellow]")
        return

    if not questionary.confirm(
        f"Sincronizar {len(complete)} levels a mobile/?",
        default=True,
    ).ask():
        return

    result = sync_mobile(candidate_level_ids=complete)
    if result.error:
        console.print(f"[red]✗[/red] {result.error}")
        return
    console.print(f"[green]✓[/green] {len(result.synced)} levels sincronizados")
    if result.skipped:
        for lid, reason in result.skipped:
            console.print(f"  [dim]-[/dim] {lid}: {reason}")


# ── action: validate ────────────────────────────────────────────────────────

def action_validate() -> None:
    console.print(f"[cyan]Ejecutando {VALIDATE_SCRIPT}…[/cyan]")
    subprocess.run([sys.executable, VALIDATE_SCRIPT])


# ── main loop ───────────────────────────────────────────────────────────────

ACTIONS = [
    ("Importar levels desde import.json", "import"),
    ("Crear level nuevo (interactivo)", "create"),
    ("Generar frases faltantes", "phrases"),
    ("Generar audio faltante", "audio"),
    ("Sync mobile (ZIPs + BUNDLED_ZIPS)", "sync"),
    ("Validar (validate_levels.py)", "validate"),
    ("Salir", "exit"),
]


def main() -> int:
    console.print("[bold cyan]admin.py[/bold cyan] — mantenimiento de levels\n")

    while True:
        import_data = _load_import_safe()
        state = st_mod.compute_state(import_data=import_data)
        print_state(state)

        choice = questionary.select(
            "Acción:",
            choices=[questionary.Choice(title=label, value=key) for label, key in ACTIONS],
        ).ask()
        if choice is None or choice == "exit":
            return 0

        try:
            if choice == "import":
                action_import(state)
            elif choice == "create":
                action_create_level()
            elif choice == "phrases":
                action_generate_phrases(state)
            elif choice == "audio":
                action_generate_audio(state)
            elif choice == "sync":
                action_sync(state)
            elif choice == "validate":
                action_validate()
        except KeyboardInterrupt:
            console.print("\n[yellow]Acción cancelada.[/yellow]")

        console.print()


if __name__ == "__main__":
    sys.exit(main())
