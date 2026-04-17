#!/usr/bin/env python3
"""
validate_levels.py — Valida que los levels estén correctos en ambas fuentes:
  - admin/levels/          (fuente de verdad)
  - mobile/assets/levels/  (ZIPs generados)

Uso:
  python3 admin/validate_levels.py   # desde el root del proyecto
  python3 validate_levels.py         # desde admin/

Exit code 0 = todo OK, 1 = hay errores.
"""

import json
import os
import re
import sys
import zipfile

# ─── Rutas ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Soporta ejecución desde admin/ o desde la raíz del proyecto
if os.path.basename(SCRIPT_DIR) == "admin":
    ROOT = os.path.dirname(SCRIPT_DIR)
else:
    ROOT = SCRIPT_DIR

PACKS_DIR = os.path.join(ROOT, "admin", "levels")
ZIPS_DIR = os.path.join(ROOT, "mobile", "assets", "levels")
APP_STORE_TS = os.path.join(ROOT, "mobile", "src", "store", "appStore.ts")
TOPICS_JSON = os.path.join(ROOT, "admin", "topics.json")

# ─── Helpers ──────────────────────────────────────────────────────────────────

REQUIRED_META_FIELDS = {"id", "topicId", "title", "description", "difficulty", "dateAdded"}
VALID_DIFFICULTIES = {'A1', 'A2', 'B1', 'B2', 'C1', 'C2'}
PACK_NAME_RE = re.compile(
    r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[a-z][a-z0-9]*(?:-[a-z0-9]+)*-(?:A1|A2|B1|B2|C1|C2)$"
)
BUNDLED_ZIPS_RE = re.compile(
    r"// ─── BUNDLED ZIPS.*?// ─── END BUNDLED ZIPS", re.DOTALL
)
BUNDLED_ENTRY_RE = re.compile(r"'([^']+)'\s*:")


def count_json_phrases(txt: str) -> tuple[int, list[str]]:
    """Cuenta frases válidas en phrases.json (array de {es, en, grammar_focus?, tip?}).
    Devuelve (count, errores)."""
    errors = []
    try:
        data = json.loads(txt)
    except json.JSONDecodeError as e:
        return 0, [f"JSON inválido: {e}"]
    if not isinstance(data, list):
        return 0, ["debe ser un array JSON"]
    bad = [
        i for i, p in enumerate(data)
        if not isinstance(p, dict) or not p.get("es") or not p.get("en")
    ]
    for i in bad[:5]:
        errors.append(f"entrada {i} inválida: falta 'es' o 'en'")
    return len(data) - len(bad), errors


def parse_bundled_zips(ts_source: str) -> list[str]:
    """Extrae los IDs de packs del bloque BUNDLED_ZIPS en appStore.ts."""
    m = BUNDLED_ZIPS_RE.search(ts_source)
    if not m:
        return []
    block = m.group(0)
    # Filtra las claves que sean IDs de level (formato kebab-case con CEFR y número)
    return [k for k in BUNDLED_ENTRY_RE.findall(block) if not k.startswith('/')]


# ─── Validación topics.json ───────────────────────────────────────────────────

def validate_topics_json() -> tuple[set[str], list[str]]:
    """Valida admin/topics.json.
    Devuelve (valid_topic_ids, errores)."""
    errors = []
    valid_ids: set[str] = set()

    if not os.path.isfile(TOPICS_JSON):
        errors.append(f"Archivo no encontrado: {TOPICS_JSON}")
        return valid_ids, errors

    try:
        with open(TOPICS_JSON, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            errors.append("admin/topics.json: debe ser un array JSON")
            return valid_ids, errors
        required = {"id", "title", "description", "icon", "color"}
        for i, t in enumerate(data):
            missing = required - set(t.keys())
            if missing:
                errors.append(f"admin/topics.json[{i}]: faltan campos {sorted(missing)}")
            else:
                valid_ids.add(t["id"])
    except json.JSONDecodeError as e:
        errors.append(f"admin/topics.json: JSON inválido: {e}")

    return valid_ids, errors


# ─── Validación admin/packs/ ──────────────────────────────────────────────────

def validate_admin_levels(valid_topic_ids: set[str] | None = None) -> tuple[list[dict], list[str]]:
    """Valida todos los levels en admin/levels/.
    Devuelve (level_infos, errores_globales)."""
    global_errors = []

    if not os.path.isdir(PACKS_DIR):
        global_errors.append(f"Directorio no encontrado: {PACKS_DIR}")
        return [], global_errors

    pack_dirs = sorted(
        d for d in os.listdir(PACKS_DIR)
        if os.path.isdir(os.path.join(PACKS_DIR, d))
    )

    if not pack_dirs:
        global_errors.append("No se encontraron levels en admin/levels/")
        return [], global_errors

    results = []
    for pack_id in pack_dirs:
        pack_path = os.path.join(PACKS_DIR, pack_id)
        errors = []
        info = {"id": pack_id, "phrase_count": 0, "mp3_count": 0, "has_audio": False}

        # Convención de nombre
        if not PACK_NAME_RE.match(pack_id):
            errors.append(
                "nombre no sigue la convención <topicId>-<levelId>-<A1|A2|B1|B2|C1|C2>"
            )

        # meta.json
        meta_path = os.path.join(pack_path, "meta.json")
        meta = None
        if not os.path.isfile(meta_path):
            errors.append("falta meta.json")
        else:
            try:
                with open(meta_path, encoding="utf-8") as f:
                    meta = json.load(f)
                missing = REQUIRED_META_FIELDS - set(meta.keys())
                if missing:
                    errors.append(f"meta.json faltan campos: {sorted(missing)}")
                if meta.get("id") != pack_id:
                    errors.append(
                        f"meta.json id={meta.get('id')!r} != carpeta {pack_id!r}"
                    )
                if meta.get("difficulty") not in VALID_DIFFICULTIES:
                    errors.append(
                        f"meta.json difficulty={meta.get('difficulty')!r} "
                        f"no está en {VALID_DIFFICULTIES}"
                    )
                if valid_topic_ids and meta.get("topicId") not in valid_topic_ids:
                    errors.append(
                        f"meta.json topicId={meta.get('topicId')!r} "
                        f"no existe en topics.json"
                    )
            except json.JSONDecodeError as e:
                errors.append(f"meta.json JSON inválido: {e}")

        # phrases.json
        phrases_path = os.path.join(pack_path, "phrases.json")
        phrase_count = 0
        if not os.path.isfile(phrases_path):
            errors.append("falta phrases.json")
        else:
            with open(phrases_path, encoding="utf-8") as f:
                txt = f.read()
            phrase_count, json_errors = count_json_phrases(txt)
            for je in json_errors:
                errors.append(f"phrases.json: {je}")
            if phrase_count == 0:
                errors.append("phrases.json no tiene frases válidas")
        info["phrase_count"] = phrase_count

        # audio/ (opcional)
        audio_path = os.path.join(pack_path, "audio")
        if os.path.isdir(audio_path):
            info["has_audio"] = True
            mp3s = [f for f in os.listdir(audio_path) if f.endswith(".mp3")]
            mp3_count = len(mp3s)
            info["mp3_count"] = mp3_count
            if phrase_count > 0 and mp3_count != phrase_count:
                errors.append(
                    f"audio/ tiene {mp3_count} mp3 pero phrases.json tiene {phrase_count} frases"
                )

        info["errors"] = errors
        results.append(info)

    return results, global_errors


# ─── Validación mobile/assets/packs/ ─────────────────────────────────────────

def validate_zips(admin_packs: list[dict]) -> tuple[list[dict], list[str]]:
    """Valida todos los ZIPs en mobile/assets/levels/.
    Devuelve (zip_infos, errores_globales)."""
    global_errors = []

    if not os.path.isdir(ZIPS_DIR):
        global_errors.append(f"Directorio no encontrado: {ZIPS_DIR}")
        return [], global_errors

    zip_files = sorted(
        f for f in os.listdir(ZIPS_DIR) if f.endswith(".zip")
    )

    admin_meta_by_id = {}
    for p in admin_packs:
        admin_meta_path = os.path.join(PACKS_DIR, p["id"], "meta.json")
        if os.path.isfile(admin_meta_path):
            with open(admin_meta_path, encoding="utf-8") as f:
                try:
                    admin_meta_by_id[p["id"]] = json.load(f)
                except json.JSONDecodeError:
                    pass

    results = []
    for zip_name in zip_files:
        pack_id = zip_name[:-4]  # quitar .zip
        zip_path = os.path.join(ZIPS_DIR, zip_name)
        errors = []
        info = {"id": pack_id, "phrase_count": 0, "mp3_count": 0}

        # ZIP válido
        if not zipfile.is_zipfile(zip_path):
            errors.append("no es un ZIP válido")
            info["errors"] = errors
            results.append(info)
            continue

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                names = zf.namelist()

                # meta.json
                meta_entry = f"{pack_id}/meta.json"
                if meta_entry not in names:
                    errors.append(f"falta {meta_entry} dentro del ZIP")
                    zip_meta = None
                else:
                    try:
                        zip_meta = json.loads(zf.read(meta_entry).decode("utf-8"))
                    except (json.JSONDecodeError, UnicodeDecodeError) as e:
                        errors.append(f"meta.json dentro del ZIP inválido: {e}")
                        zip_meta = None

                # phrases.json
                phrases_entry = f"{pack_id}/phrases.json"
                phrase_count = 0
                if phrases_entry not in names:
                    errors.append(f"falta {phrases_entry} dentro del ZIP")
                else:
                    try:
                        phrases_data = json.loads(zf.read(phrases_entry).decode("utf-8"))
                        if not isinstance(phrases_data, list):
                            errors.append("phrases.json no es un array JSON")
                        else:
                            bad = [
                                i for i, p in enumerate(phrases_data)
                                if not isinstance(p, dict)
                                or not p.get("spanish")
                                or not p.get("english")
                            ]
                            if bad:
                                errors.append(
                                    f"phrases.json: entradas inválidas en índices {bad[:5]}"
                                )
                            phrase_count = len(phrases_data)
                    except (json.JSONDecodeError, UnicodeDecodeError) as e:
                        errors.append(f"phrases.json inválido: {e}")
                info["phrase_count"] = phrase_count

                # audio/
                audio_prefix = f"{pack_id}/audio/"
                mp3s = [
                    n for n in names
                    if n.startswith(audio_prefix) and n.endswith(".mp3")
                ]
                mp3_count = len(mp3s)
                info["mp3_count"] = mp3_count
                admin_pack = next((p for p in admin_packs if p["id"] == pack_id), None)
                admin_has_audio = admin_pack["has_audio"] if admin_pack else True
                if not mp3s and admin_has_audio:
                    errors.append("no hay archivos .mp3 en audio/")
                elif phrase_count > 0 and mp3_count > 0 and mp3_count != phrase_count:
                    errors.append(
                        f"{phrase_count} frases pero {mp3_count} mp3 → DESINCRONIZADO"
                    )

                # Consistencia con admin meta.json
                if zip_meta and pack_id in admin_meta_by_id:
                    admin_meta = admin_meta_by_id[pack_id]
                    mismatches = []
                    for field in ("id", "topicId", "title", "description", "difficulty"):
                        if zip_meta.get(field) != admin_meta.get(field):
                            mismatches.append(
                                f"{field}: ZIP={zip_meta.get(field)!r} "
                                f"vs admin={admin_meta.get(field)!r}"
                            )
                    if mismatches:
                        errors.append(
                            "meta.json difiere de admin/packs: " + "; ".join(mismatches)
                        )

        except zipfile.BadZipFile as e:
            errors.append(f"ZIP corrupto: {e}")

        info["errors"] = errors
        results.append(info)

    return results, global_errors


# ─── Consistencia entre fuentes ───────────────────────────────────────────────

def validate_consistency(
    admin_packs: list[dict],
    zip_infos: list[dict],
) -> list[str]:
    """Verifica que packs con audio tengan ZIP y que BUNDLED_ZIPS sea coherente."""
    errors = []

    admin_with_audio = {p["id"] for p in admin_packs if p["has_audio"]}
    zip_ids = {z["id"] for z in zip_infos}

    # Packs con audio que no tienen ZIP
    missing_zips = admin_with_audio - zip_ids
    for pid in sorted(missing_zips):
        errors.append(f"admin/{pid} tiene audio pero falta {pid}.zip en mobile/assets/levels/")

    # ZIPs huérfanos (sin level en admin/)
    admin_ids = {p["id"] for p in admin_packs}
    orphan_zips = zip_ids - admin_ids
    for pid in sorted(orphan_zips):
        errors.append(f"{pid}.zip existe en mobile/assets/levels/ pero no hay level en admin/levels/{pid}/")

    # BUNDLED_ZIPS en appStore.ts
    bundled_errors = []
    if not os.path.isfile(APP_STORE_TS):
        bundled_errors.append(f"No se encontró {APP_STORE_TS}")
    else:
        with open(APP_STORE_TS, encoding="utf-8") as f:
            ts_source = f.read()
        if not BUNDLED_ZIPS_RE.search(ts_source):
            bundled_errors.append(
                "No se encontró el bloque BUNDLED_ZIPS en appStore.ts "
                "(¿cambió el formato?)"
            )
        else:
            bundled_ids = set(parse_bundled_zips(ts_source))
            extra = bundled_ids - zip_ids
            missing = zip_ids - bundled_ids
            for pid in sorted(extra):
                bundled_errors.append(
                    f"BUNDLED_ZIPS lista {pid!r} pero no existe el ZIP"
                )
            for pid in sorted(missing):
                bundled_errors.append(
                    f"ZIP {pid}.zip existe pero falta en BUNDLED_ZIPS"
                )

    return errors + bundled_errors


# ─── Main ─────────────────────────────────────────────────────────────────────

def _cleanup_orphan_topics() -> list[str]:
    """Elimina de topics.json los topics sin levels en disco. Devuelve ids eliminados."""
    if not os.path.isfile(TOPICS_JSON):
        return []
    try:
        with open(TOPICS_JSON, encoding="utf-8") as f:
            topics = json.load(f)
        if not isinstance(topics, list):
            return []
    except Exception:
        return []

    # Solo topics con al menos un level completo (frases + todos los mp3)
    complete_topic_ids: set[str] = set()
    if os.path.isdir(PACKS_DIR):
        for d in os.listdir(PACKS_DIR):
            pack_path = os.path.join(PACKS_DIR, d)
            meta_path = os.path.join(pack_path, "meta.json")
            phrases_path = os.path.join(pack_path, "phrases.json")
            audio_dir = os.path.join(pack_path, "audio")
            if not os.path.isfile(meta_path) or not os.path.isfile(phrases_path):
                continue
            try:
                with open(meta_path, encoding="utf-8") as f:
                    meta = json.load(f)
                tid = meta.get("topicId", "")
                if not tid:
                    continue
                with open(phrases_path, encoding="utf-8") as f:
                    phrases = json.load(f)
                phrase_count = len([p for p in phrases if isinstance(p, dict) and p.get("es") and p.get("en")])
                if phrase_count == 0:
                    continue
                mp3_count = len([f for f in os.listdir(audio_dir) if f.endswith(".mp3")]) if os.path.isdir(audio_dir) else 0
                if mp3_count == phrase_count:
                    complete_topic_ids.add(tid)
            except Exception:
                pass
    used_topic_ids = complete_topic_ids

    kept = [t for t in topics if t.get("id") in used_topic_ids]
    removed = [t["id"] for t in topics if t.get("id") not in used_topic_ids]
    if removed:
        with open(TOPICS_JSON, "w", encoding="utf-8") as f:
            json.dump(kept, f, ensure_ascii=False, indent=2)
            f.write("\n")
    return removed


def main() -> int:
    print("Validando levels...\n")
    total_errors = 0

    # 0a. Limpiar topics.json (eliminar topics sin levels)
    removed_topics = _cleanup_orphan_topics()
    if removed_topics:
        print(f"topics.json limpiado: eliminados {len(removed_topics)} topics sin levels: {', '.join(removed_topics)}\n")

    # 0b. topics.json
    valid_topic_ids, topics_errors = validate_topics_json()
    print(f"topics.json ({len(valid_topic_ids)} topics):")
    if topics_errors:
        for e in topics_errors:
            print(f"  ✗ {e}")
            total_errors += len(topics_errors)
    else:
        print(f"  ✓ admin/topics.json OK: {sorted(valid_topic_ids)}")

    # 1. admin/levels/
    admin_packs, admin_global_errors = validate_admin_levels(valid_topic_ids if not topics_errors else None)
    for e in admin_global_errors:
        print(f"  ERROR GLOBAL: {e}")
        total_errors += 1

    admin_ids = {p["id"] for p in admin_packs}
    packs_without_audio = [p for p in admin_packs if not p["has_audio"]]

    print(f"admin/levels/ ({len(admin_packs)} levels):")
    for p in admin_packs:
        errs = p["errors"]
        if errs:
            total_errors += len(errs)
            print(f"  ✗ {p['id']}:")
            for e in errs:
                print(f"      → {e}")
        else:
            audio_part = f", {p['mp3_count']} mp3" if p["has_audio"] else " (sin audio)"
            print(f"  ✓ {p['id']}: {p['phrase_count']} frases{audio_part}")

    # 2. mobile/assets/levels/
    zip_infos, zip_global_errors = validate_zips(admin_packs)
    for e in zip_global_errors:
        print(f"\n  ERROR GLOBAL: {e}")
        total_errors += 1

    print(f"\nmobile/assets/levels/ ({len(zip_infos)} ZIPs):")
    for z in zip_infos:
        errs = z["errors"]
        if errs:
            total_errors += len(errs)
            print(f"  ✗ {z['id']}.zip:")
            for e in errs:
                print(f"      → {e}")
        else:
            print(
                f"  ✓ {z['id']}.zip: {z['phrase_count']} frases, "
                f"{z['mp3_count']} mp3, meta OK"
            )

    # 3. Consistencia
    print("\nConsistencia:")
    consistency_errors = validate_consistency(admin_packs, zip_infos)

    zip_ids = {z["id"] for z in zip_infos}
    admin_with_audio = {p["id"] for p in admin_packs if p["has_audio"]}
    missing_zips = admin_with_audio - zip_ids
    orphan_zips = zip_ids - admin_ids

    if not missing_zips and not orphan_zips:
        print("  ✓ Todos los levels con audio tienen su ZIP correspondiente")
    for e in [
        e for e in consistency_errors
        if "BUNDLED_ZIPS" not in e and "appStore" not in e
    ]:
        print(f"  ✗ {e}")
        total_errors += 1

    # BUNDLED_ZIPS check
    bundled_errors = [
        e for e in consistency_errors
        if "BUNDLED_ZIPS" in e or "appStore" in e or "parsear" in e
    ]
    if not bundled_errors and zip_infos:
        # Leer BUNDLED_ZIPS para reportar el conteo correcto
        if os.path.isfile(APP_STORE_TS):
            with open(APP_STORE_TS, encoding="utf-8") as f:
                ts_source = f.read()
            bundled_ids = parse_bundled_zips(ts_source)
            print(
                f"  ✓ BUNDLED_ZIPS en appStore.ts lista {len(bundled_ids)} levels correctamente"
            )
        else:
            print("  ✗ No se encontró appStore.ts")
            total_errors += 1
    else:
        for e in bundled_errors:
            print(f"  ✗ {e}")
            total_errors += 1

    # 4. Resumen
    total_phrases = sum(p["phrase_count"] for p in admin_packs)
    print()

    if total_errors == 0:
        print(
            f"✅ Todo correcto: {len(admin_packs)} levels, {total_phrases} frases"
        )
        if packs_without_audio:
            names = ", ".join(p["id"] for p in packs_without_audio)
            print(f"   (levels sin audio: {names})")
    else:
        noun = "error" if total_errors == 1 else "errores"
        print(f"❌ {total_errors} {noun} encontrado{'s' if total_errors != 1 else ''}")

    return 0 if total_errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
