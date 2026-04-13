#!/usr/bin/env python3
"""
admin.py — entrypoint único de mantenimiento para admin/.

Muestra el estado del sistema y ofrece acciones idempotentes:
  1. Crear level nuevo (interactivo)
  2. Generar frases faltantes  ← también crea el directorio si viene de import.json
  3. Generar audio faltante
  4. Sync mobile (ZIPs + BUNDLED_ZIPS)
  5. Validar (invoca validate_levels.py)

Uso: python3 admin/admin.py
Requiere: pip install -r requirements.txt y el binario `claude` en PATH (para
          generación de frases y sugerencia de icon/color de topics nuevos).
"""
import json
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
from lib.importer import load_import_json  # noqa: E402
from lib.levels import create_level_dir, scan_level_dirs  # noqa: E402
from lib.paths import (  # noqa: E402
    CEFR_LEVELS,
    IMPORT_JSON,
    LEVELS_DIR,
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
    console.print(
        f"[dim]topics.json:[/dim] {len(topics_known)}  "
        f"[dim]usados:[/dim] {len(topics_used)}"
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
        table.add_column("topic")
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
                lv["topic_id"] or "",
                lv["id"],
                str(lv["phrase_count"]),
                str(lv["mp3_count"]),
                f"[{color}]{status_text}[/{color}]",
            )
        console.print(table)
    else:
        console.print("[dim](no hay levels en admin/levels/)[/dim]")
    console.print()


# ── action: create level interactively ─────────────────────────────────────

def _validate_id(value: str, existing: set[str]) -> "bool | str":
    value = value.strip()
    if not re.match(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$", value):
        return "Usa kebab-case: letras minúsculas, dígitos y guiones. Debe empezar por letra."
    if value in existing:
        return f"Ya existe '{value}'."
    return True


def _create_topic_interactive() -> "dict | None":
    topics = load_topics()
    existing = {t["id"] for t in topics}

    topic_id = questionary.text(
        "ID del topic (kebab-case):",
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
        if not re.match(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$", v):
            return "kebab-case: solo [a-z0-9-], empezar por letra"
        return True

    level_id = questionary.text("levelId (kebab-case, único dentro del topic):", validate=_val).ask()
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

    prompt = questionary.text(
        "Prompt para generación de frases (vacío = usa descripción):",
    ).ask()
    if prompt is None:
        return
    prompt = prompt.strip()

    try:
        full_id = create_level_dir(
            topic_id=topic["id"],
            level_id=level_id,
            cefr=cefr,
            title=title,
            description=description,
            existing_dirs=existing_dirs,
            prompt=prompt,
        )
        console.print(f"[green]✓[/green] Level creado: {full_id}")
    except Exception as e:
        console.print(f"[red]✗[/red] {e}")


# ── action: generate phrases ────────────────────────────────────────────────

def action_generate_phrases(state: dict) -> None:
    # Levels existentes en disco sin phrases.json
    existing_pending = [lv for lv in state["levels"] if lv["status"] == st_mod.ST_NO_PHRASES]
    # Levels de import.json que aún no existen en disco
    import_pending = state["import_diff"]["levels_to_create"] if state["import_diff"] else []

    if not existing_pending and not import_pending:
        console.print("[green]No hay levels pendientes de frases.[/green]")
        return

    # Filtro CEFR (pre-selección en el checkbox)
    all_cefrs = sorted(
        {lv["cefr"] for lv in existing_pending if lv.get("cefr")}
        | {lv["cefr"] for lv in import_pending if lv.get("cefr")}
    )
    preselected_existing: set[str] = set()
    preselected_import: set[tuple] = set()
    if len(all_cefrs) > 1:
        filter_choices = (
            [questionary.Choice(title="Todos", value="__all__")]
            + [questionary.Choice(title=c, value=c) for c in all_cefrs]
        )
        cefr_filter = questionary.select(
            "Filtrar por dificultad (pre-selecciona el grupo en el checkbox):",
            choices=filter_choices,
        ).ask()
        if cefr_filter is None:
            return
        if cefr_filter != "__all__":
            preselected_existing = {lv["id"] for lv in existing_pending if lv["cefr"] == cefr_filter}
            preselected_import = {
                (lv["topic_id"], lv["level_id"], lv["cefr"])
                for lv in import_pending if lv["cefr"] == cefr_filter
            }

    choices = []
    for lv in existing_pending:
        checked = (lv["id"] in preselected_existing) if preselected_existing else True
        choices.append(questionary.Choice(
            title=f"{lv['id']}  — {lv['title']}",
            value={"source": "existing", "id": lv["id"]},
            checked=checked,
        ))
    for lv in import_pending:
        key = (lv["topic_id"], lv["level_id"], lv["cefr"])
        checked = (key in preselected_import) if preselected_import else True
        choices.append(questionary.Choice(
            title=f"{lv['topic_id']}-{lv['level_id']}-{lv['cefr']}  — {lv['title']}  [nuevo]",
            value={"source": "import", "data": lv},
            checked=checked,
        ))

    selected = questionary.checkbox(
        f"Selecciona levels para generar frases (N={DEFAULT_N_PHRASES} por level):",
        choices=choices,
    ).ask()
    if not selected:
        return

    topics = load_topics()
    existing_topic_ids = {t["id"] for t in topics}

    for item in selected:
        if item["source"] == "existing":
            level_id = item["id"]
        else:
            lv = item["data"]
            # Crear topic si aún no existe
            if lv["topic_id"] not in existing_topic_ids:
                topic_data = next(
                    (t for t in state["import_diff"]["topics_to_create"] if t["id"] == lv["topic_id"]),
                    None,
                )
                if not topic_data:
                    console.print(f"  [red]✗[/red] Topic '{lv['topic_id']}' no encontrado")
                    continue
                topics.append(topic_data)
                save_topics(topics)
                existing_topic_ids.add(lv["topic_id"])
                console.print(f"  [green]✓[/green] Topic '{lv['topic_id']}' creado")
            # Crear directorio del level
            try:
                existing_dirs = scan_level_dirs()
                level_id = create_level_dir(
                    topic_id=lv["topic_id"],
                    level_id=lv["level_id"],
                    cefr=lv["cefr"],
                    title=lv["title"],
                    description=lv.get("description", ""),
                    existing_dirs=existing_dirs,
                    prompt=lv.get("prompt", ""),
                    n=lv.get("n"),
                )
                console.print(f"  [green]✓[/green] Directorio creado: {level_id}")
            except FileExistsError:
                existing_dirs = scan_level_dirs()
                n = lv.get("n")
                if n:
                    level_id = f"{lv['topic_id']}-{lv['level_id']}-{lv['cefr']}-{n}"
                else:
                    prefix = f"{lv['topic_id']}-{lv['level_id']}-{lv['cefr']}-"
                    matches = [d for d in existing_dirs if d.startswith(prefix)]
                    level_id = matches[0] if matches else None
                if not level_id:
                    console.print(f"  [red]✗[/red] No se pudo determinar el id del level")
                    continue
            except Exception as e:
                console.print(f"  [red]✗[/red] Error creando directorio: {e}")
                continue

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


# ── action: browse ──────────────────────────────────────────────────────────

_BACK = "__back__"   # sentinel para opciones "Volver" en questionary


def _delete_audio_dir(level_id: str) -> None:
    """Borra todos los mp3 del directorio audio/ de un level."""
    import glob as _glob
    audio_dir = os.path.join(LEVELS_DIR, level_id, "audio")
    for mp3 in _glob.glob(os.path.join(audio_dir, "*.mp3")):
        os.remove(mp3)


def _disk_status_badge(lv: dict) -> str:
    """Símbolo de estado en disco (sin ANSI, questionary no los soporta)."""
    s = lv["status"]
    if s == st_mod.ST_COMPLETE:
        return "✓  completo"
    if s == st_mod.ST_NO_PHRASES:
        return "⚠  sin frases"
    if s == st_mod.ST_AUDIO_PARTIAL:
        return f"⚠  falta {len(lv['missing_audio_indices'])} mp3"
    if s == st_mod.ST_AUDIO_ORPHANS:
        return "◈  mp3 huérfanos"
    if s == st_mod.ST_NO_META:
        return "✗  sin meta"
    return "✗  id inválido"


def _browse_phrases(lv: dict) -> None:
    """Muestra las frases del level y permite escuchar los audios."""
    level_id = lv["id"]
    phrases_path = os.path.join(LEVELS_DIR, level_id, "phrases.json")
    audio_dir = os.path.join(LEVELS_DIR, level_id, "audio")

    with open(phrases_path, encoding="utf-8") as f:
        phrases = json.load(f)

    console.print()
    for i, p in enumerate(phrases, 1):
        console.print(f"  [bold]{i:2d}.[/bold]  {p.get('es', '')}")
        console.print(f"       [dim]{p.get('en', '')}[/dim]")
    console.print()

    # Si no hay audios, sólo se mostraban las frases
    mp3_available = {
        int(f[:-4])
        for f in os.listdir(audio_dir)
        if f.endswith(".mp3") and f[:-4].isdigit()
    } if os.path.isdir(audio_dir) else set()

    if not mp3_available:
        questionary.press_any_key_to_continue("(no hay audio — pulsa cualquier tecla)").ask()
        return

    choices = [
        questionary.Choice(
            title=(
                f"{'▶' if i in mp3_available else ' '} {i:2d}.  "
                f"{phrases[i-1].get('es', '')}"
            ),
            value=i,
        )
        for i in range(1, len(phrases) + 1)
    ] + [questionary.Choice(title="← Volver", value=_BACK)]

    while True:
        try:
            sel = questionary.select(
                "Escuchar (▶ = tiene audio):",
                choices=choices,
            ).unsafe_ask()
        except KeyboardInterrupt:
            return
        if not sel or sel == _BACK:
            return

        mp3 = os.path.join(audio_dir, f"{sel:03d}.mp3")
        if os.path.isfile(mp3):
            p = phrases[sel - 1]
            console.print(f"  [bold]{p.get('es', '')}[/bold]")
            console.print(f"  [dim]{p.get('en', '')}[/dim]")
            subprocess.run(["afplay", mp3], check=False)
        else:
            console.print(f"  [yellow]No hay audio para la frase {sel}[/yellow]")


def _browse_level_actions(lv: dict) -> None:
    """Submenú de acciones para un level que existe en disco."""
    level_id = lv["id"]
    s = lv["status"]
    color = "green" if s == st_mod.ST_COMPLETE else ("red" if s in (st_mod.ST_NO_META, st_mod.ST_INVALID_ID) else "yellow")
    console.print(
        f"\n  [{color}]{_disk_status_badge(lv)}[/{color}]  [bold]{level_id}[/bold]  "
        f"[dim]{lv['phrase_count']} frases · {lv['mp3_count']} mp3[/dim]"
    )

    mp3_count = lv["mp3_count"]
    if mp3_count:
        phrases_label = f"Generar frases  ⚠ borrará {mp3_count} mp3"
    else:
        phrases_label = "Generar frases"

    choices = []
    if lv["has_phrases"]:
        choices.append(questionary.Choice(title="Ver y escuchar frases", value="view"))
    choices.append(questionary.Choice(title=phrases_label, value="phrases"))
    if lv["has_phrases"]:
        choices.append(questionary.Choice(title="Generar audio faltante", value="audio"))
    choices.append(questionary.Choice(title="Cancelar", value=_BACK))

    try:
        action = questionary.select("Accion:", choices=choices).unsafe_ask()
    except KeyboardInterrupt:
        return
    if not action or action == _BACK:
        return

    topics = load_topics()
    if action == "view":
        _browse_phrases(lv)
    elif action == "phrases":
        res = generate_phrases_for_level(level_id, topics, n=DEFAULT_N_PHRASES)
        if res.status == "created":
            console.print(f"  [green]✓[/green] {level_id}: {res.count} frases generadas")
            if mp3_count:
                _delete_audio_dir(level_id)
                console.print(f"  [yellow]✗ {mp3_count} mp3 borrados[/yellow]")
        else:
            console.print(f"  [red]✗[/red] {level_id}: {res.message}")
    elif action == "audio":
        console.print(f"[cyan]→[/cyan] {level_id}")

        def _on_progress(i, total, text, skipped):
            if skipped:
                console.print(f"  [dim]{i:3d}/{total}  (skip)  {text}[/dim]")
            else:
                console.print(f"  [green]{i:3d}/{total}[/green]  {text}")

        res = generate_audio_for_level(level_id, on_progress=_on_progress)
        if res.error:
            console.print(f"  [red]✗[/red] {res.error}")
        else:
            console.print(
                f"  [green]✓ {len(res.generated)} generados[/green], "
                f"{len(res.skipped)} saltados"
                + (f", [magenta]{len(res.orphan_mp3s)} huérfanos[/magenta]" if res.orphan_mp3s else "")
            )


def _reload_disk_state() -> dict[str, dict]:
    """Devuelve índice {level_full_id: level_info} del estado actual en disco."""
    import_data = _load_import_safe()
    s = st_mod.compute_state(import_data=import_data)
    return {lv["id"]: lv for lv in s["levels"]}


def action_browse(_state: dict) -> None:
    """Navegador por topics/levels de import.json cruzado con estado en disco."""
    import_data = _load_import_safe()
    if not import_data:
        console.print("[yellow]No se pudo leer import.json[/yellow]")
        return

    # ── nivel 1: lista de topics ────────────────────────────────────────────
    while True:
        disk = _reload_disk_state()

        topic_choices = []
        for t in import_data:
            tid = t["id"]
            lvs = t.get("levels", [])
            total = len(lvs)
            complete = 0
            for lv_def in lvs:
                prefix = f"{tid}-{lv_def['id']}-{lv_def['difficulty']}-"
                if any(disk[fid]["status"] == st_mod.ST_COMPLETE for fid in disk if fid.startswith(prefix)):
                    complete += 1
            mark = "✓" if complete == total else f"{complete}/{total}"
            label = f"{mark:6s}  {tid}  ({t['title']})"
            topic_choices.append(questionary.Choice(title=label, value=tid))

        topic_choices.append(questionary.Choice(title="← Volver al menu", value=_BACK))

        console.print()
        try:
            sel_topic = questionary.select(
                "Browse — elige topic:",
                choices=topic_choices,
            ).unsafe_ask()
        except KeyboardInterrupt:
            return
        if not sel_topic or sel_topic == _BACK:
            return

        topic_data = next(t for t in import_data if t["id"] == sel_topic)

        # ── nivel 2: lista de levels del topic ──────────────────────────────
        while True:
            disk = _reload_disk_state()
            lvs_def = topic_data.get("levels", [])

            total = len(lvs_def)
            complete = sum(
                1 for lv_def in lvs_def
                if any(
                    disk[fid]["status"] == st_mod.ST_COMPLETE
                    for fid in disk
                    if fid.startswith(f"{sel_topic}-{lv_def['id']}-{lv_def['difficulty']}-")
                )
            )
            color = "green" if complete == total else "yellow"
            console.print(
                f"\n  [bold]{sel_topic}[/bold]  [dim]{topic_data['title']}[/dim]  "
                f"[{color}]{complete}/{total} completos[/{color}]"
            )

            level_choices = []
            for lv_def in lvs_def:
                prefix = f"{sel_topic}-{lv_def['id']}-{lv_def['difficulty']}-"
                matches = sorted(fid for fid in disk if fid.startswith(prefix))
                if not matches:
                    val = _BACK  # no hay nada que hacer; skip acción
                    label = f"{'—':8s}  {prefix}?  {lv_def['title']}"
                else:
                    fid = matches[0]
                    lv_data = disk[fid]
                    pc = lv_data["phrase_count"]
                    mc = lv_data["mp3_count"]
                    is_complete = lv_data["status"] == st_mod.ST_COMPLETE
                    mark = "✓" if is_complete else " "
                    count_str = f"{mark} {pc:2d}fr/{mc:2d}mp3"
                    val = fid
                    label = f"{count_str}  {fid}"
                level_choices.append(questionary.Choice(title=label, value=val))

            level_choices.append(questionary.Choice(title="← Volver a topics", value=_BACK))

            try:
                sel_level = questionary.select(
                    "Elige level:",
                    choices=level_choices,
                ).unsafe_ask()
            except KeyboardInterrupt:
                break  # vuelve a topics
            if not sel_level or sel_level == _BACK:
                break  # vuelve a topics

            lv_info = disk.get(sel_level)
            if not lv_info:
                continue

            try:
                _browse_level_actions(lv_info)
            except KeyboardInterrupt:
                console.print("\n[yellow]Accion cancelada.[/yellow]")
            console.print()


# ── main loop ───────────────────────────────────────────────────────────────

ACTIONS = [
    ("Browse (explorar topics y levels)", "browse"),
    ("Crear level nuevo (interactivo)", "create"),
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
            if choice == "browse":
                action_browse(state)
            elif choice == "create":
                action_create_level()
            elif choice == "sync":
                action_sync(state)
            elif choice == "validate":
                action_validate()
        except KeyboardInterrupt:
            console.print("\n[yellow]Acción cancelada.[/yellow]")

        console.print()


if __name__ == "__main__":
    sys.exit(main())
