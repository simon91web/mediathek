# macOS-Portierung

Umgesetzt auf einem Apple-Silicon-Mac (Branch `macos-portierung`). Der Plan
darunter bleibt als Begründung stehen.

**Teil A (Laufzeit):** Ordner-Dialog über `osascript`, Assistent-Start über
`scripts/assistent-starten.sh` und Terminal.app (Auftragstext nie in
AppleScript interpoliert), Aufträge mit `detached` / Prozessgruppe, Zustand
unter `~/Library/Application Support/Mediathek`, Verknüpfung als Symlink auf
das `.app`.

**Teil B (Paket):** `npm run paket` baut unter macOS `dist/Mediathek/Mediathek.app`.
Node kommt als offizielle `darwin-arm64`-Binärdatei von nodejs.org (Homebrew-
node ist nicht eigenständig), ffmpeg samt dylibs, Icon über `iconutil`,
Starter als `Contents/MacOS/mediathek`. Windows-Paket unverändert, wenn das
Skript unter Windows läuft.

**Offen:** Developer-ID-Notarisierung (Kollege braucht Rechtsklick → Öffnen),
ein Intel-Paket nur von einem Intel-Mac. Homebrew-ffmpeg wird mitkopiert, nicht
als statischer Download bezogen.

---

Ein Plan, kein Code — so entstand dieser Text auf einer Windows-Maschine ohne
Zugriff auf einen Mac. Jede Stelle ist mit Datei und Zeile belegt. Die
Umsetzung steht im Code; dieser Plan erklärt, warum sie so aussieht.

Zwei unabhängige Blöcke: **Teil A** macht `npm run dev` auf einem Mac
benutzbar (Ordner-Dialog, Assistent-Start, Aufträge abbrechen). **Teil B**
baut das weitergebbare Paket — deutlich mehr Arbeit, eigene Formate, und mit
Gatekeeper ein Hindernis, das es unter Windows so nicht gibt. Teil A steht
für sich; Teil B setzt auf denselben Code auf, ist aber ein eigenes Projekt.

## Schon plattformneutral — nichts zu tun

Der Code ist an mehr Stellen vorbereitet, als man erwarten würde:

- **`lib/shell/open-folder.ts`** (Z. 19-27) verzweigt bereits sauber:
  `win32` → `explorer.exe`, `darwin` → `open`, sonst `xdg-open`. Das ist der
  Stil, den die übrigen Stellen unten auch bräuchten.
- **`lib/jobs/python.ts`** — `venvPython()` (Z. 24-28) unterscheidet bereits
  `Scripts/python.exe` (Windows) von `bin/python` (alles andere). Die
  cuBLAS-Pfad-Logik (Z. 47-58) ist zwar Windows-Pfadstruktur, bleibt aber
  auf einem Mac einfach `null` — kein Absturz, kein NVIDIA/CUDA, das ist
  richtig so.
- **`lib/assistant/run.ts`** (Z. 96-102) und **`lib/assistant/chat.ts`**
  (Z. 160-166) — der fensterlose Lauf für die Kette und der einmalige
  Chat-Aufruf — rufen das KI-Werkzeug direkt über `spawn(tool, args, {...})`
  auf, ohne PowerShell-Umweg. Beide sind bereits plattformneutral.
- **`lib/media/locate.ts`** (Z. 25) und alle `windowsHide: true`-Vorkommen
  (`lib/features.ts`, `lib/media/probe.ts`, `lib/media/poster.ts`,
  `lib/jobs/*.ts`) — laut Node-Doku unter Nicht-Windows wirkungslos, kein
  Portierungsbedarf.
- **`lib/shell/shortcut.ts`** Z. 39 (`findLauncher()`) und
  **`scripts/fixtures.ts`** Z. 131 (`makeSpeechWav()`) prüfen bereits
  `process.platform` und fallen sauber auf „Funktion gibt es hier nicht"
  zurück, statt zu crashen.

## Teil A — Laufzeit

### A1. Ordner-Dialog (`lib/shell/pick-folder.ts`)

Aktuell: `if (process.platform !== "win32")` (Z. 85-91 nach dem letzten
Umbau) lehnt jede andere Plattform mit einer Fehlermeldung ab. Der
Windows-Weg ruft `powershell.exe` mit einem `OpenFileDialog`-Trick auf (siehe
Kommentar in der Datei).

Das macOS-Äquivalent ist AppleScript über `osascript` — `choose folder` ist
der native Finder-Dialog, kein Trick nötig:

```
osascript -e 'POSIX path of (choose folder with prompt "Ordner fuer die Mediathek waehlen")'
```

Ein Abbruch durch den Nutzer erzeugt bei AppleScript **keinen leeren
Erfolg**, sondern einen Laufzeitfehler mit Code `-128` ("User canceled.") auf
stderr und einen Exit-Code ungleich 0 — das muss ausdrücklich abgefangen
werden (`fehler.includes("-128")`), sonst zeigt die App bei jedem Abbrechen
eine Fehlermeldung statt nichts zu tun.

Skizze (ungeprüft, folgt dem bestehenden Muster aus derselben Datei —
Zeitüberschreitung, ein Dialog gleichzeitig, `windowsHide`/`shell: false`):

```ts
function pickFolderMac(): Promise<PickResult> {
  return new Promise((resolve) => {
    let fertig = false;
    const schliessen = (result: PickResult) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(
      "osascript",
      [
        "-e",
        'POSIX path of (choose folder with prompt "Ordner fuer die Mediathek waehlen")',
      ],
      { windowsHide: true, shell: false },
    );

    const timer = setTimeout(() => {
      child.kill();
      schliessen({ ok: false, canceled: true });
    }, TIMEOUT_MS);

    let ausgabe = "";
    let fehler = "";
    child.stdout?.on("data", (c: Buffer) => (ausgabe += c.toString("utf8")));
    child.stderr?.on("data", (c: Buffer) => (fehler += c.toString("utf8")));
    child.on("error", (error) =>
      schliessen({ ok: false, error: `Der Dialog liess sich nicht oeffnen: ${error.message}` }),
    );
    child.on("close", (code) => {
      const dir = ausgabe.trim();
      if (dir) return schliessen({ ok: true, dir });
      if (fehler.includes("-128")) return schliessen({ ok: false, canceled: true });
      schliessen({
        ok: false,
        error: `Der Dialog endete mit ${code}.${fehler.trim() ? " " + fehler.trim().slice(0, 200) : ""}`,
      });
    });
  });
}
```

`pickFolder()` selbst wird zur Weiche: der bestehende `globalForPicker`-Riegel
(ein Dialog gleichzeitig) bleibt plattformübergreifend, nur der Aufruf
verzweigt auf `pickFolderWindows()` oder `pickFolderMac()`.

### A2. Sichtbarer Assistent-Start (`lib/assistant/start.ts` + neues Skript)

Der Windows-Weg: `start.ts` (Z. 74-76) zeigt fest auf
`scripts/assistent-starten.ps1`, ruft es über `spawn("powershell.exe", [...],
{shell:false, windowsHide:true})` (Z. 168-179) mit sauber getrennten
Argumenten auf (`-File`, `-LibraryDir`, `-Tool`, `-Prompt`, `-ToolArgs`,
`-Slug`). Das Skript selbst validiert jedes Argument einzeln per
`ValidatePattern` (Z. 49, 55, 59, 63) und öffnet über `Start-Process
-WindowStyle Normal -ArgumentList @('-NoExit', ...)` ein neues, offen
bleibendes Fenster (Z. 100-103).

**Die wichtigste Regel dabei überträgt sich unverändert:** nie eine
Kommandozeile per String-Verkettung aus dem Auftragstext bauen. Unter Windows
funktioniert das, weil PowerShells `-ArgumentList` echte, getrennte Argumente
sind — kein Anführungszeichen im Auftragstext kann daraus ausbrechen. Unter
macOS ist die Versuchung groß, den Auftragstext direkt in einen
`osascript -e '...'`-String einzusetzen — **das wäre eine Einladung zur
Befehls-Injektion**, weil AppleScript-Quotierung und Shell-Quotierung zwei
verschiedene, sich nicht deckende Regelwerke sind.

Der sichere Weg: eine temporäre Shell-Datei, deren Inhalt Node selbst
schreibt (mit einer echten Shell-Quoting-Funktion, nicht mit
Template-String-Verkettung), und die `osascript` danach nur noch über ihren
**Pfad** anspricht — der Pfad selbst enthält nichts, was aus dem
Auftragstext stammt:

```
osascript -e 'tell application "Terminal" to do script "/pfad/zur/temp-datei.sh"'
```

Die temp-Datei (analog zu `scripts/assistent-starten.ps1`, aber Bash) trägt
dieselben Riegel:

```bash
#!/bin/bash
set -euo pipefail
cd -- "$1"
echo "Bibliothek: $1"
echo "Werkzeug:   $2"
"$2" "${@:4}" "$3"
```

— mit `$1`…`$n` als echte Positionsparameter (kein String-Zusammenbau), exakt
wie `-ArgumentList` unter Windows. Grammatik-Prüfung (nur Buchstaben, Ziffern,
Punkt, Bindestrich, Unterstrich für Werkzeugname/Slug, siehe `isToolName` in
`lib/settings.ts`) passiert weiterhin **vor** dem Schreiben der temp-Datei,
in TypeScript — dort steht sie schon (`preflight.ts`, plattformneutral, kein
Portierungsbedarf laut Recherche).

Die Sperre zwischen zwei Starts und das Protokoll (`assistent-starts.log`)
sind reine Dateisystem-Logik in `start.ts`, nicht im `.ps1`/`.sh` — die
übertragen sich ohne Änderung.

### A3. Fensterloser Lauf & Chat — nichts zu tun

Siehe oben, Abschnitt „Schon plattformneutral".

### A4. Einen Auftrag abbrechen — Prozessgruppen (`lib/jobs/queue.ts`)

Der POSIX-Zweig existiert bereits (Z. 480-489 laut Recherche):

```ts
try {
  process.kill(-job.pid, "SIGTERM"); // Prozessgruppe
} catch {
  try {
    process.kill(job.pid, "SIGTERM");
  } catch {}
}
```

**Ist aber wirkungslos**, weil die drei Stellen, die diesen `pid` erzeugen,
den Kindprozess ohne eigene Prozessgruppe starten:

- `lib/jobs/transcribe-job.ts` Z. 240-243
- `lib/jobs/extract-job.ts` Z. 43-46
- `lib/jobs/python-job.ts` Z. 72-75

Alle drei spawnen mit `{ cwd, shell: false, stdio: [...], windowsHide: true
}` — ohne `detached`. Ohne eigene Prozessgruppe erbt das Kind die des
Node-Servers; `process.kill(-job.pid, ...)` trifft dann keine echte Gruppe
und scheitert mit `ESRCH`, der Code fällt auf `process.kill(job.pid, ...)`
zurück — nur Python stirbt, ein von Python gestartetes `ffmpeg` läuft
verwaist weiter. Genau das Problem, das unter Windows
`tools/procutil.py` über ein Win32-Job-Objekt löst (dort bereits sauber
hinter `os.name != "nt"` versteckt, Z. 27-28, 41, 49-50, 125-126 — kein
Crash unter macOS, aber auch kein Ersatz).

**Der Fix ist eine Zeile an allen drei Stellen:**

```ts
spawn(python, args, {
  cwd,
  shell: false,
  stdio: [...],
  windowsHide: true,
  detached: process.platform !== "win32",
});
```

`detached: true` ruft unter Linux/macOS intern `setsid()` — das Kind wird
Anführer einer eigenen Prozessgruppe, `ffmpeg` (von Python aus als normaler
Kindprozess gestartet) erbt dieselbe Gruppe automatisch. `process.kill(-pid,
"SIGTERM")` aus `queue.ts` trifft dann beide. **Voraussetzung, die auf dem
Mac zu prüfen ist:** `tools/transcribe.py` darf `ffmpeg` nicht selbst über
eine eigene neue Sitzung starten (kein eigenes `setsid`/`start_new_session`
in `subprocess.Popen` dort) — sonst bricht die Gruppenzugehörigkeit genau an
der Stelle, wo sie gebraucht wird. Eine echte POSIX-Entsprechung zum
Job-Objekt in `tools/procutil.py` ist bei dieser Lösung **nicht** nötig,
solange diese Voraussetzung stimmt.

### A5. Desktop-Verknüpfung (optional, niedrige Priorität)

`lib/shell/shortcut.ts` — `desktopDir()` (Z. 71) nutzt `USERPROFILE`
(Windows-Env-Var, unter macOS leer) statt `os.homedir()`. `createDesktopShortcut()`
(Z. 99-179) legt eine `.lnk` per PowerShell-COM an — reines Windows-Format,
keine Entsprechung. Für macOS wäre ein einfacher Symlink auf das `.app`-Bundle
(`ln -s`) oder ein Finder-Alias per `osascript` die Entsprechung — aber erst
relevant, wenn Teil B (das Paket) existiert, auf das verknüpft werden könnte.
Bis dahin verschwindet der „Starten"-Abschnitt unter Einstellungen → Programm
auf einem Mac einfach (`findLauncher()` gibt bereits `null` zurück) — kein
Fehler, keine Dringlichkeit.

## Teil B — Das weitergebbare Paket

### B0. Grundsatzentscheidung zuerst

Die Windows-Lösung (`Mediathek.cmd` + `app/ohne-konsole.vbs`) existiert nur,
um ein kurzes Konsolen-Aufblitzen beim Doppelklick auf eine `.cmd`-Datei zu
verstecken. Dieses Problem **gibt es unter macOS in der Form nicht**: eine
Doppelklick-`.command`-Datei öffnet immer sichtbar Terminal.app (kein
Verstecken vorgesehen), während ein echtes `.app`-Bundle beim Start über den
Finder von Haus aus **kein** Terminalfenster zeigt — genau das gewünschte
Verhalten, ganz ohne Trick.

**Empfehlung: kein `.command`-Skript zum Doppelklicken, sondern ein
minimales `.app`-Bundle** (`Mediathek.app/Contents/MacOS/mediathek` als
ausführbares Shell-Skript + `Contents/Info.plist` + `Contents/Resources/mediathek.icns`).
Das ist der Rahmen, in den B1-B10 einzahlen — die Alternative (`.command`)
wäre zwar schneller gebaut, sähe aber dauerhaft unfertig aus (Terminal bleibt
offen, kein Icon im Dock/Finder).

### B1. Node-Binärdatei

`scripts/paket.mjs` Z. 221 kopiert `process.execPath` fest als `node.exe`.
Unter macOS heißt die Datei `node` (ohne Endung), und die Ausführungsrechte
müssen nach dem Kopieren ausdrücklich gesetzt werden — `fs.copyFile` erhält
Rechte nicht zuverlässig plattformübergreifend, explizit
`fs.chmod(ziel, 0o755)` danach nicht vergessen.

### B2. Icon (`scripts/icon.mjs`)

Die Pixel-Zeichenfunktion `zeichnen()` (Z. 22-81 laut Recherche — rundes
Quadrat mit „M") ist bereits plattformneutral und wiederverwendbar. Nur
`bmp()`/`buildIcon()` (Z. 83-137) sind das ICO-Containerformat
(BITMAPINFOHEADER, doppelte Höhe für die Maske) — für macOS wird daraus ein
`.icns` gebraucht.

**Das lässt sich nicht auf dieser Windows-Maschine vorbereiten**, weil der
naheliegende Weg über `iconutil` (Apples eigenes Kommandozeilenwerkzeug zum
Bauen eines `.icns` aus einem `.iconset`-Ordner) nur auf macOS existiert.
Der Plan dafür: `zeichnen()` wiederverwenden, um PNGs in den von `iconutil`
verlangten Größen zu erzeugen (16/32/64/128/256/512 px, dazu die `@2x`-Varianten
mit denselben Pixelmaßen wie die nächstgrößere Stufe), in einen Ordner
`mediathek.iconset/` mit den vorgeschriebenen Dateinamen
(`icon_16x16.png`, `icon_16x16@2x.png`, …) schreiben, dann:

```
iconutil -c icns mediathek.iconset -o mediathek.icns
```

### B3. ffmpeg

`ffmpegDazu()` (Z. 243-265) sucht aktuell über `where ffmpeg` (Windows) und
kopiert **alles** aus dessen `bin`-Ordner außer `ffplay*` — das setzt den
Windows-„shared build" mit DLLs daneben voraus. Auf macOS: `which ffmpeg`
statt `where`, und das Kopiermuster anpassen — ein Homebrew-`ffmpeg` bringt
i. d. R. nur die beiden Binärdateien `ffmpeg`/`ffprobe` mit, keine
DLL-Nachbarn; ein „alles außer ffplay kopieren" ergäbe dort meist nur zwei
Dateien, ist also unschädlich, aber die Quelle muss geprüft werden (Homebrew
installiert nach `/opt/homebrew/bin` auf Apple Silicon, `/usr/local/bin` auf
Intel — `which` findet den richtigen Pfad automatisch, solange Homebrews
`bin`-Verzeichnis im `PATH` steht).

**Architekturfrage siehe B10** — ein für Apple Silicon gebautes `ffmpeg`
läuft nicht auf einem Intel-Mac und umgekehrt.

### B4. Starter-Skript

Ersetzt den `STARTER`-Batch-Text (Z. 342-448) — statt `@echo off`/`chcp`/
`taskkill /PID !SERVERPID! /T /F` (Z. 443) ein Bash-Skript als
`Contents/MacOS/mediathek`:

- Node-Server im Hintergrund starten, PID direkt über `$!` merken (siehe B5
  — kein Datei-Umweg nötig, anders als unter Windows).
- Warten, bis der Port antwortet (kleine Schleife mit `curl -sf
  http://127.0.0.1:3200 >/dev/null` statt des `port.js`-Helfers).
- Browser öffnen: entweder `open http://127.0.0.1:3200` (Standardbrowser,
  einfachste Lösung, aber ein Tab statt ein eigenes Fenster — Abweichung vom
  Windows-Verhalten) oder, um beim „eigenes Fenster, kein Tab"-Prinzip aus
  AGENTS.md zu bleiben: gezielt Chrome mit `--app=` und eigenem
  `--user-data-dir` starten (`open -na "Google Chrome" --args
  --app=http://127.0.0.1:3200 --user-data-dir=...`), mit Rückfall auf
  Safari/Standardbrowser, falls Chrome fehlt.
- Beim Schließen des Browserfensters den Server beenden — unter Windows
  wartet `Start-Process` synchron auf das Browser-Prozessende; die
  `open -na --args`-Variante auf macOS startet **nicht** synchron wartend,
  das müsste über ein Polling auf den Chrome-Prozess (eigenes
  `--user-data-dir` macht ihn eindeutig identifizierbar) oder eine
  `wait`-Schleife auf die PID nachgebaut werden.

### B5. PID-Handling vereinfacht sich

`helferSchreiben()` (Z. 269-332) erzeugt zur Baupzeit `start.js`, das die PID
in `process.env.TEMP` schreibt (Z. 295) — ein Umweg, der laut Kommentar im
Skript (Z. 288-290) nur existiert, weil `cmd.exe`s `start /b` die PID des
gestarteten Prozesses nicht direkt hergibt. Ein Bash-Starter hat dieses
Problem nicht: `node .next/standalone/server.js & SERVER_PID=$!` liefert die
PID sofort, keine Zwischendatei nötig. Falls doch eine gebraucht wird
(z. B. für ein separates Stop-Skript): `mktemp` statt `$TEMP` (unter macOS
nicht gesetzt, `os.tmpdir()`-Äquivalent ist `mktemp -d`).

### B6. ASCII-Zwang entfällt

`nurAsciiSchreiben` (Z. 550-564) existiert nur, weil `cmd.exe`/`wscript`
byteweise lesen und an einem UTF-8-Umlaut verrutschen (siehe AGENTS.md,
Abschnitt „Starter und VBS sind reines ASCII"). Ein Bash-Skript liest UTF-8
klaglos — diese Prüfung braucht für den macOS-Zweig kein Gegenstück, deutsche
Meldungen mit Umlauten sind dort unproblematisch.

### B7. Pflichtprüfungen in `paket.mjs` anpassen

Die `muss`-Liste (Z. 603-614) verlangt wörtlich `"Mediathek.cmd"` und
`"app/scripts/assistent-starten.ps1"` — für den macOS-Zweig des Skripts (falls
ein Skript beide Plattformen baut) oder ein eigenes `paket-mac.mjs` müsste die
Liste die neuen Pfade nennen (`Mediathek.app/Contents/MacOS/mediathek`, das
neue `.sh`-Gegenstück zu `assistent-starten.ps1`).

### B8. Desktop-Verknüpfung fürs Paket

Sobald `Mediathek.app` existiert, ist die einfachste „Verknüpfung":
`ln -s /Pfad/zu/Mediathek.app ~/Desktop/Mediathek.app` — kein COM-Objekt, kein
Sonderformat, siehe A5.

### B9. Gatekeeper — der Unterschied, der unter Windows keine Entsprechung hat

Ein unsigniertes `.exe` unter Windows zeigt SmartScreen-Warnungen, die sich
mit zwei Klicks umgehen lassen. **Ein unsigniertes `.app`-Bundle unter macOS
verweigert den Start ganz**, sobald es von einer anderen Maschine kopiert
wurde (Quarantäne-Attribut `com.apple.quarantine`, das macOS beim Herunterladen
oder Kopieren über bestimmte Wege setzt) — die Meldung ist „kann nicht
geöffnet werden, da der Entwickler nicht verifiziert werden kann". Drei Wege,
keiner davon trivial:

1. **Apple-Developer-ID-Signatur + Notarisierung** (kostenpflichtig, 99 $/Jahr,
   sauberste Lösung für „an Kollegen weitergeben").
2. **Manuelles Freigeben** bei jedem Kollegen: Rechtsklick → Öffnen (statt
   Doppelklick) beim ersten Start, oder Systemeinstellungen →
   Datenschutz & Sicherheit → „Trotzdem öffnen".
3. **Quarantäne-Attribut entfernen**: `xattr -cr /Pfad/zu/Mediathek.app` —
   funktioniert, ist aber ein Kommandozeilen-Schritt, den ein Kollege ohne
   Anleitung nicht von selbst machen wird.

Das gehört an die Stelle in `AGENTS.md`, an der heute die Windows-„beim
Kollegen mit Firmen-Virenschutz"-Frage offen steht — dieselbe Kategorie
Problem, andere Plattform, eher noch strenger.

### B10. Architektur: Apple Silicon vs. Intel

Anders als bei Windows (praktisch nur x64) gibt es zwei relevante
macOS-Architekturen. `process.execPath` (B1) und das gefundene `ffmpeg` (B3)
müssen zur **selben** Architektur gehören wie die Zielmaschine — ein auf
Apple Silicon gebautes Paket mit dortigem `node`/`ffmpeg` läuft auf einem
Intel-Mac nicht (und, mit Rosetta 2, umgekehrt nur mit Leistungseinbußen,
aber immerhin lauffähig). Entweder zwei Pakete bauen (`arm64`, `x64`) oder,
wo verfügbar, universelle Binärdateien verwenden (Node bietet keine
offiziellen universal-Builds mehr an, ffmpeg-Bezugsquellen wie evermeet.cx
teils schon) — das muss auf einem echten Mac entschieden werden, je nachdem,
welche Kollegen-Maschinen tatsächlich im Einsatz sind.

## Reihenfolge-Empfehlung

1. **A1-A4** zuerst — kleine, unabhängige Änderungen, sofort per `npm run
   dev` auf dem Mac überprüfbar, kein Paket-Aufwand nötig.
2. **B0** als Entscheidung, bevor an B1-B9 gearbeitet wird — sie hängt nicht
   an Code, sondern legt den Rahmen fest.
3. **B1-B7** (Node, Icon, ffmpeg, Starter, PID, ASCII, Pflichtliste) — der
   eigentliche Paketbau.
4. **B9 (Gatekeeper)** früh mitdenken, nicht erst am Ende: sie entscheidet,
   ob „Paket kopieren und weitergeben" überhaupt ohne Erklärung funktioniert.
5. **B8, B10** zuletzt — Komfort bzw. eine Entscheidung, die von der
   tatsächlichen Kollegen-Hardware abhängt.

## Was sich nur auf einem echten Mac klären lässt

- Ob `tools/transcribe.py` `ffmpeg` ohne eigene neue Sitzung startet
  (Voraussetzung für A4 — durch Beobachten von `ps -o pgid` während eines
  laufenden Transkriptions-Auftrags zu prüfen).
- Das tatsächliche Verhalten von `choose folder` bei einem Netzlaufwerk/einer
  SMB-Freigabe (A1) — ob der zurückgegebene POSIX-Pfad für die Bibliothek
  brauchbar ist oder ob macOS eigene Mount-Pfade (`/Volumes/...`) liefert, die
  sich anders verhalten als ein gemappter Windows-Laufwerksbuchstabe.
  Vermutlich unproblematisch (POSIX-Pfade sind stabiler als
  Windows-Laufwerksbuchstaben), aber unbestätigt.
- `iconutil`, `codesign`, `xattr` — existieren nur auf macOS, keine Vorschau
  von hier aus möglich (B2, B9).
- Ob Homebrews `ffmpeg` auf der jeweiligen Zielmaschine überhaupt vorausgesetzt
  werden darf, oder ob ein eigener Download (wie unter Windows) besser passt
  (B3, B10).
