#!/bin/bash
# Mediathek starten — Gegenstück zu "Mediathek starten.bat".
#
# Doppelklick genügt. Der Browser öffnet sich von selbst. Das Fenster
# bleibt offen, solange der Server läuft — beenden mit Strg+C oder das
# Terminal-Fenster schließen.
#
# Warum "npm run dev" und nicht der Produktionsserver: dieselbe Begründung
# wie in der .bat. Der echte Produktionsstarter gehört ins weitergegebene
# Paket (npm run paket): dort liegt ein fertiger Bau samt eigener node-
# Binärdatei.

set -euo pipefail

cd "$(dirname "$0")"

ADRESSE="http://127.0.0.1:3200"
export HOSTNAME=127.0.0.1

echo
echo "  Mediathek"
echo "  $PWD"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  FEHLER: Node.js wurde nicht gefunden."
  echo
  echo "  Node 22 oder neuer von https://nodejs.org installieren, dann dieses"
  echo "  Fenster neu starten."
  echo
  read -r _
  exit 1
fi

if node -e "require('net').connect(3200,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})" >/dev/null 2>&1; then
  echo "  Auf Port 3200 antwortet schon etwas — die Mediathek läuft also"
  echo "  bereits. Es wird kein zweiter Server gestartet, nur der Browser"
  echo "  geöffnet."
  echo
  open "$ADRESSE"
  sleep 4
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "  Die Abhängigkeiten fehlen noch. Das dauert beim ersten Mal ein"
  echo "  paar Minuten."
  echo
  npm install
  echo
fi

echo "  Server auf $ADRESSE"
echo "  Dieses Fenster offen lassen. Beenden mit Strg+C."
echo

(sleep 3 && open "$ADRESSE") &

npm run dev

echo
echo "  Der Server ist beendet."
echo
