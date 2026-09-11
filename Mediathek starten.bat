@echo off
chcp 65001 >nul
setlocal EnableExtensions

rem ===========================================================================
rem  Mediathek starten
rem
rem  Doppelklick genuegt. Der Browser oeffnet sich von selbst. Das Fenster
rem  bleibt offen, solange der Server laeuft -- beenden mit Strg+C oder
rem  Fenster schliessen.
rem ===========================================================================
rem
rem  WARUM "npm run dev" UND NICHT DER PRODUKTIONSSERVER:
rem
rem  Nachgemessen, nicht vermutet. "next build" braucht hier 16 Sekunden, und
rem  danach geht es nicht weiter wie erwartet:
rem
rem    1. "next start" lehnt Next selbst ab, sobald output: "standalone" in
rem       next.config.ts steht -- und das steht dort fuer das Viewer-Paket:
rem         "next start does not work with output: standalone configuration"
rem       Der Server antwortet zwar, aber etwas zu starten, wovon das
rem       Framework sagt, es funktioniere nicht, gehoert in keinen Starter.
rem    2. Der vorgeschlagene Weg, "node .next/standalone/server.js", laeuft
rem       mit .next/standalone als Arbeitsverzeichnis. Der Standard-
rem       Bibliotheksordner wird aber relativ dazu aufgeloest und zeigte dann
rem       ins Leere. Dagegen hilft nur MEDIATHEK_LIBRARY_DIR -- und die
rem       SPERRT die Ordnerwahl in den Einstellungen.
rem
rem  Fuer eine lokale Mediathek mit einem Benutzer ist der Entwicklungsserver
rem  genau richtig: startet in etwa einer Sekunde, das Arbeitsverzeichnis
rem  stimmt, die Ordnerwahl bleibt bedienbar, und Aenderungen am Code sind
rem  sofort da. Nur die erste Anzeige einer Seite dauert einen Moment, weil
rem  sie dann uebersetzt wird.
rem
rem  Der richtige Produktionsstarter gehoert ins weitergegebene Viewer-Paket
rem  (Etappe 4): dort liegt ein fertiger Bau samt eigener node.exe, und dort
rem  ist ein fest vorgegebener Bibliotheksordner gewollt.
rem ===========================================================================
rem
rem  WARUM DIESE DATEI OHNE UMLAUTE GESCHRIEBEN IST:
rem  cmd.exe liest eine .bat byteweise und merkt sich Dateioffsets. Steht
rem  oben "chcp 65001" und weiter unten ein UTF-8-Umlaut, verrutscht das
rem  Lesen -- nachgemessen: aus "setlocal" wurde "tlocal", aus "Mediathek"
rem  "ediathek", und der Start brach mit "Syntaxfehler" ab. Deshalb hier
rem  durchgehend ae/oe/ue/ss. Das chcp bleibt trotzdem stehen: es richtet die
rem  Konsole fuer die Ausgaben von Node und Next ein, und die haben Umlaute.
rem ===========================================================================

rem Immer im Projektordner arbeiten, egal von wo aufgerufen.
cd /d "%~dp0"

set "ADRESSE=http://127.0.0.1:3200"

rem HOSTNAME ist Pflicht: ohne sie bindet Next auf 0.0.0.0 und die Mediathek
rem waere im Firmennetz offen. Das npm-Skript setzt zusaetzlich -H.
set "HOSTNAME=127.0.0.1"

echo.
echo   Mediathek
echo   %CD%
echo.

rem ------------------------------------------------------------- Node da?
where node >nul 2>nul
if errorlevel 1 (
  echo   FEHLER: Node.js wurde nicht gefunden.
  echo.
  echo   Node 22 oder neuer von https://nodejs.org installieren, dann dieses
  echo   Fenster neu starten.
  echo.
  pause
  exit /b 1
)

rem --------------------------------------------- Antwortet da schon jemand?
rem Bewusst per Node und nicht per netstat: dessen Ausgabe ist uebersetzt
rem ("ABHOEREN" statt "LISTENING"), und darauf zu filtern bricht auf einem
rem englischen Windows. Ausserdem laesst Next nur EINEN Entwicklungsserver
rem je Verzeichnis zu -- ein zweiter Start endet mit einer Fehlermeldung.
node -e "require('net').connect(3200,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})" >nul 2>nul
if not errorlevel 1 (
  echo   Auf Port 3200 antwortet schon etwas -- die Mediathek laeuft also
  echo   bereits. Es wird kein zweiter Server gestartet, nur der Browser
  echo   geoeffnet.
  echo.
  start "" "%ADRESSE%"
  rem Kurz stehen lassen, damit die Meldung beim Doppelklick lesbar bleibt.
  rem "ping" statt "timeout": timeout bricht ab, sobald die Eingabe umgeleitet
  rem ist ("Die Eingabeumleitung wird nicht unterstuetzt"), und das passiert,
  rem sobald die Datei nicht von Hand in einer Konsole laeuft.
  ping -n 5 127.0.0.1 >nul
  exit /b 0
)

rem -------------------------------------------------------- Abhaengigkeiten
if not exist "node_modules\" (
  echo   Die Abhaengigkeiten fehlen noch. Das dauert beim ersten Mal ein
  echo   paar Minuten.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   FEHLER: "npm install" ist fehlgeschlagen. Die Meldung steht oben.
    echo.
    pause
    exit /b 1
  )
  echo.
)

rem ---------------------------------------------------------------- Starten
echo   Server auf %ADRESSE%
echo   Dieses Fenster offen lassen. Beenden mit Strg+C.
echo.

rem Der Browser kommt aus einem eigenen Fenster, weil "npm run dev" blockt.
rem PowerShell statt verschachtelter cmd-Aufrufe: eine Ebene Anfuehrungs-
rem zeichen weniger, und in Batch ist genau das die Fehlerquelle.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 3; Start-Process '%ADRESSE%'"

call npm run dev

rem Hierhin kommt man nur, wenn der Server sich beendet hat.
echo.
echo   Der Server ist beendet.
echo.
pause
endlocal
