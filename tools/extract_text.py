"""Text aus Anhängen ziehen, damit die Suche ihn findet.

Aufruf:

    tools/.venv/Scripts/python.exe tools/extract_text.py
        --dir "<Bibliothek>/medien/<slug>/anhaenge"
        [--force]

Geschrieben wird je Anhang eine Datei
``<dir>/.text/<dateiname>.txt``. Der Punktordner wird vom
Bibliotheks-Scan übersprungen — es sind Hilfsdateien für die Suche, keine
Anhänge.

Auf stdout stehen JSON-Lines wie in transcribe.py.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    sys.stderr.reconfigure(encoding="utf-8", newline="\n")
except Exception:
    pass

PROTOCOL_VERSION = 1
TEXT_DIR = ".text"

# Nur was sich verlässlich in Text verwandeln lässt. Word und PowerPoint
# kommen später dazu; dafür braucht es weitere Pakete.
SUPPORTED = {".pdf": "pdf", ".txt": "text", ".md": "text", ".csv": "text"}


def emit(event_type: str, **fields) -> None:
    print(
        json.dumps({"v": PROTOCOL_VERSION, "type": event_type, **fields},
                   ensure_ascii=False),
        flush=True,
    )


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def extract_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts: list[str] = []
    for number, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:
            log(f"Seite {number} von {path.name} nicht lesbar: {exc}")
            continue
        text = text.strip()
        if text:
            parts.append(text)
    return "\n\n".join(parts)


def extract_plain(path: Path) -> str:
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except (UnicodeDecodeError, OSError):
            continue
    return ""


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    directory = Path(args.dir)
    if not directory.is_dir():
        emit("done", extracted=0, skipped=0, message="Kein Anhangsordner.")
        return

    text_dir = directory / TEXT_DIR
    extracted = 0
    skipped = 0
    failed = 0

    candidates = sorted(
        entry
        for entry in directory.iterdir()
        if entry.is_file()
        and not entry.name.startswith(".")
        and entry.suffix.lower() in SUPPORTED
    )

    wieviele = (
        "1 Anhang wird" if len(candidates) == 1 else f"{len(candidates)} Anhänge werden"
    )
    emit("stage", stage="extract", message=f"{wieviele} gelesen …")

    for index, entry in enumerate(candidates):
        target = text_dir / f"{entry.name}.txt"

        # Nur neu lesen, wenn die Quelle jünger ist als der Auszug.
        if not args.force and target.is_file():
            try:
                if target.stat().st_mtime >= entry.stat().st_mtime:
                    skipped += 1
                    continue
            except OSError:
                pass

        kind = SUPPORTED[entry.suffix.lower()]
        try:
            text = extract_pdf(entry) if kind == "pdf" else extract_plain(entry)
        except Exception as exc:
            failed += 1
            log(f"{entry.name}: {exc}")
            emit("warn", code="extract_failed", message=f"{entry.name} ließ sich nicht lesen.")
            continue

        cleaned = "\n".join(
            line.strip() for line in text.splitlines() if line.strip()
        ).strip()

        if not cleaned:
            # Ein gescanntes PDF ohne Textebene. Eine leere Datei wird
            # geschrieben, damit nicht bei jedem Lauf erneut versucht wird.
            write_atomic(target, "")
            emit(
                "warn",
                code="kein_text",
                message=(
                    f"{entry.name} enthält keinen Text — vermutlich ein Scan. "
                    "Texterkennung ist noch nicht eingebaut."
                ),
            )
            skipped += 1
            continue

        write_atomic(target, cleaned)
        extracted += 1
        emit(
            "progress",
            stage="extract",
            done_sec=index + 1,
            total_sec=len(candidates),
            ratio=round((index + 1) / max(1, len(candidates)), 4),
        )

    emit(
        "done",
        extracted=extracted,
        skipped=skipped,
        failed=failed,
        message=(
            f"{extracted} von {len(candidates)} "
            + ("Anhang" if len(candidates) == 1 else "Anhängen")
            + " gelesen"
            + (f", {skipped} unverändert" if skipped else "")
            + (f", {failed} fehlgeschlagen" if failed else "")
            + "."
        ),
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover
        emit("error", code="internal", message="Unerwarteter Fehler.", detail=str(exc))
        sys.exit(1)
