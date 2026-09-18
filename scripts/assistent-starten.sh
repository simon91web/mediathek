#!/bin/bash
# Oeffnet ein sichtbares Terminal mit einem KI-Kommandozeilenwerkzeug im
# Bibliotheksordner. Gegenstueck zu assistent-starten.ps1.
#
# Die Mediathek erzeugt Kapitel, Zusammenfassungen, Bezuege und Themenseiten
# nicht selbst. Das macht ein Werkzeug nach Wahl auf den Transkripten.
# Dieses Skript ist die Bruecke: es startet eine Sitzung, deren
# Arbeitsverzeichnis der Bibliotheksordner ist.
#
# Sicherheit: alle Werte kommen aus einer Positivliste. --tool darf nur aus
# Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich bestehen (also
# kein Pfad, kein Leerzeichen, kein Anfuehrungszeichen), --prompt nur aus
# harmlosen Textzeichen. Die Mediathek ruft das Skript mit einzelnen
# Argumenten auf, nie ueber eine zusammengebaute Kommandozeile.
#
# Aufruf:
#   ./scripts/assistent-starten.sh \
#     --library-dir /Pfad/zur/Bibliothek \
#     --tool claude \
#     --prompt "Befolge die Anweisungen in anleitungen/kapitel.md." \
#     [--slug beitrag] [--tool-args exec] [--dry-run]

set -euo pipefail

# Homebrew liegt auf Apple Silicon oft nur in der interaktiven zsh.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

LIBRARY_DIR=""
TOOL=""
PROMPT=""
SLUG=""
DRY_RUN=0
TOOL_ARGS=()

usage() {
  echo "Aufruf: $0 --library-dir DIR --tool NAME --prompt TEXT [--slug SLUG] [--tool-args ...] [--dry-run]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --library-dir)
      [[ $# -ge 2 ]] || usage
      LIBRARY_DIR="$2"
      shift 2
      ;;
    --tool)
      [[ $# -ge 2 ]] || usage
      TOOL="$2"
      shift 2
      ;;
    --prompt)
      [[ $# -ge 2 ]] || usage
      PROMPT="$2"
      shift 2
      ;;
    --slug)
      [[ $# -ge 2 ]] || usage
      SLUG="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --tool-args)
      shift
      TOOL_ARGS=("$@")
      break
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unbekanntes Argument: $1" >&2
      usage
      ;;
  esac
done

if [[ -z "$LIBRARY_DIR" || -z "$TOOL" || -z "$PROMPT" ]]; then
  echo "Es fehlen --library-dir, --tool oder --prompt." >&2
  exit 1
fi

if [[ ! "$TOOL" =~ ^[A-Za-z0-9._-]{1,40}$ ]]; then
  echo "Der Werkzeugname ist unzulaessig: $TOOL" >&2
  exit 1
fi

# {1,400} uebersteigt unter macOS-Bash 3.2 die Wiederholungsgrenze 255.
if [[ ${#PROMPT} -lt 1 || ${#PROMPT} -gt 400 ]]; then
  echo "Der Auftragstext ist zu lang oder leer." >&2
  exit 1
fi
if [[ ! "$PROMPT" =~ ^[[:alnum:][:space:]äöüÄÖÜß.,:/\-]+$ ]]; then
  echo "Der Auftragstext enthaelt unzulaessige Zeichen." >&2
  exit 1
fi

if [[ -n "$SLUG" && ! "$SLUG" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
  echo "Der Slug ist unzulaessig: $SLUG" >&2
  exit 1
fi

for arg in "${TOOL_ARGS[@]+"${TOOL_ARGS[@]}"}"; do
  if [[ ! "$arg" =~ ^[A-Za-z0-9._-]{1,40}$ ]]; then
    echo "Ein Werkzeug-Argument ist unzulaessig: $arg" >&2
    exit 1
  fi
done

if [[ ! -d "$LIBRARY_DIR" ]]; then
  echo "Der Bibliotheksordner existiert nicht: $LIBRARY_DIR" >&2
  exit 1
fi

if ! command -v "$TOOL" >/dev/null 2>&1; then
  echo "Das Werkzeug '$TOOL' wurde nicht gefunden. Steht es im Suchpfad?" >&2
  exit 1
fi

if [[ -n "$SLUG" ]]; then
  markdown="$LIBRARY_DIR/medien/$SLUG/beitrag.md"
  if [[ ! -f "$markdown" ]]; then
    echo "Es gibt keine Datei $markdown." >&2
    exit 1
  fi
fi

echo "Bibliothek: $LIBRARY_DIR"
echo "Werkzeug:   $TOOL"
echo "Auftrag:    $PROMPT"
echo

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "(dry-run) $TOOL ${TOOL_ARGS[*]+${TOOL_ARGS[*]} }$PROMPT"
  exit 0
fi

cd -- "$LIBRARY_DIR"
set +e
"$TOOL" ${TOOL_ARGS[@]+"${TOOL_ARGS[@]}"} "$PROMPT"
status=$?
set -e

echo
echo "Beendet mit Status $status. Fenster kann geschlossen werden."
exec "${SHELL:-/bin/bash}" -i
