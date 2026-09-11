/*
 * Baut das weitergebbare Paket: ein Ordner, den man kopiert und startet.
 *
 *   node scripts/paket.mjs [--ohne-ffmpeg] [--smoke]
 *
 * ZIEL: keine Installation. Wer den Ordner bekommt, macht einen Doppelklick.
 * Deshalb liegen node.exe und ffmpeg mit im Paket — die einzige Ausnahme
 * bleibt Python für die Transkription, weil dort Modelle von mehreren
 * Gigabyte dazugehören, die niemand mitkopieren will.
 *
 * DREI DINGE, DIE HIER NICHT SCHIEFGEHEN DÜRFEN:
 *
 * 1. **`.next/static` und `public` kopiert der standalone-Build NICHT mit.**
 *    Die App rendert dann, hat aber kein CSS und hydratisiert nicht — das
 *    sieht nach einem kaputten Build aus und ist bloß ein fehlender Ordner.
 *    Deshalb der Smoke-Test, der genau danach schaut.
 * 2. **`outputFileTracingExcludes` wirkt unter Turbopack nicht** (Stand Next
 *    16.3): der Build zieht `bibliothek-dev` samt Mediendateien mit hinein.
 *    Hier wird deshalb selbst gefiltert UND danach geprüft.
 * 3. **Das Arbeitsverzeichnis ist `app/`.** `vorlagen/`, `scripts/`, `tools/`
 *    und `ffmpeg/bin` werden zur Laufzeit gegen `process.cwd()` aufgelöst —
 *    sie müssen dort drin liegen, sonst fehlt dem Autorenmodus die halbe
 *    Ausstattung.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { buildIcon } from "./icon.mjs";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist", "Mediathek");
const APP = path.join(DIST, "app");

const args = process.argv.slice(2);
const ohneFfmpeg = args.includes("--ohne-ffmpeg");
const nurSmoke = args.includes("--nur-smoke");
const smoke = args.includes("--smoke") || nurSmoke;

/*
 * Was niemals ins Paket gehört.
 *
 * Zwei Listen, und der Unterschied ist wichtig:
 *
 * NIE_OBEN gilt nur für die OBERSTE Ebene des kopierten Ordners. Ein
 * `dist/` dort ist das zuletzt gebaute Paket — der Datei-Tracer zieht es
 * beim nächsten Build in sich selbst hinein, und das Paket verdoppelt sich
 * bei jedem Lauf (nachgemessen: 315 MB → 600 MB). Ein `dist/` IN
 * node_modules ist dagegen der Normalfall und muss mit.
 *
 * NIE_ ÜBERALL gilt in jeder Tiefe — Mediendateien, Umgebungsdateien, die
 * Python-Umgebung.
 */
const NIE_OBEN = new Set([
  "dist",
  "bibliothek-dev",
  "e2e",
  "test",
  "test-results",
  "playwright-report",
  ".git",
  ".next",
  "tsconfig.tsbuildinfo",
  "package-lock.json",
]);

const NIE_UEBERALL = [
  /(^|[\\/])\.env/i,
  /(^|[\\/])\.venv([\\/]|$)/i,
  /(^|[\\/])__pycache__([\\/]|$)/i,
  /\.(mp4|m4v|mov|mkv|webm|m4a|mp3|wav|ogg|opus|flac)$/i,
];

function verboten(relativ) {
  // Unter Windows trennt der Backslash — beide Formen also berücksichtigen.
  const teile = relativ.split(/[\\/]/);
  if (teile.length === 1 && NIE_OBEN.has(teile[0])) return true;
  return NIE_UEBERALL.some((muster) => muster.test(relativ));
}

function sagen(text) {
  process.stdout.write(`${text}\n`);
}

async function leeren(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

/** Kopiert rekursiv und lässt aus, was nicht ins Paket darf. */
async function kopieren(von, nach, basis = von, optionen = {}) {
  const eintraege = await fs.readdir(von, { withFileTypes: true });
  for (const eintrag of eintraege) {
    const quelle = path.join(von, eintrag.name);
    const relativ = path.relative(basis, quelle);
    const erlaubt = (optionen.erlaubeOben ?? []).includes(relativ);
    if (!erlaubt && verboten(relativ)) continue;

    const ziel = path.join(nach, eintrag.name);
    if (eintrag.isDirectory()) {
      await fs.mkdir(ziel, { recursive: true });
      await kopieren(quelle, ziel, basis, optionen);
    } else if (eintrag.isSymbolicLink()) {
      // Auflösen statt verlinken: das Paket wird kopiert, oft über SMB.
      const echt = await fs.realpath(quelle).catch(() => null);
      if (echt) await fs.cp(echt, ziel, { recursive: true, dereference: true });
    } else if (eintrag.isFile()) {
      await fs.copyFile(quelle, ziel);
    }
  }
}

async function groesse(dir) {
  let bytes = 0;
  const eintraege = await fs.readdir(dir, { withFileTypes: true });
  for (const eintrag of eintraege) {
    const p = path.join(dir, eintrag.name);
    if (eintrag.isDirectory()) bytes += await groesse(p);
    else if (eintrag.isFile()) bytes += (await fs.stat(p)).size;
  }
  return bytes;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

// ────────────────────────────────────────────────────────────────── Bauen

async function bauen() {
  /*
   * Den alten standalone-Ordner wegwerfen: Next räumt ihn nicht auf, und
   * Dateien eines früheren Builds blieben sonst im Paket liegen.
   */
  await fs.rm(path.join(ROOT, ".next", "standalone"), {
    recursive: true,
    force: true,
  });

  sagen("Bauen (next build) …");
  const bau = spawnSync("npx", ["next", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  if (bau.status !== 0) {
    throw new Error("next build ist fehlgeschlagen.");
  }
}

async function zusammenstellen() {
  const standalone = path.join(ROOT, ".next", "standalone");
  if (!fsSync.existsSync(standalone)) {
    throw new Error(
      'Es gibt kein .next/standalone — steht output: "standalone" in next.config.ts?',
    );
  }

  sagen("Paket zusammenstellen …");
  await leeren(DIST);
  await fs.mkdir(APP, { recursive: true });

  /*
   * `.next` steht in NIE_OBEN, weil es beim Kopieren der Quellordner nichts
   * zu suchen hat — im standalone-Ordner ist es aber genau der Build.
   * Deshalb hier ausdrücklich erlaubt.
   */
  await kopieren(standalone, APP, standalone, { erlaubeOben: [".next"] });

  /*
   * Die zwei Ordner, die der standalone-Build vergisst. Genau hier entsteht
   * sonst der Fehler „rendert, aber ohne CSS".
   */
  await fs.cp(
    path.join(ROOT, ".next", "static"),
    path.join(APP, ".next", "static"),
    { recursive: true, dereference: true },
  );
  const publicDir = path.join(ROOT, "public");
  if (fsSync.existsSync(publicDir)) {
    await fs.cp(publicDir, path.join(APP, "public"), {
      recursive: true,
      dereference: true,
    });
  }

  // Zur Laufzeit gegen process.cwd() aufgelöst — müssen also nach app/.
  await fs.mkdir(path.join(APP, "vorlagen"), { recursive: true });
  await kopieren(
    path.join(ROOT, "vorlagen", "bibliothek"),
    await fs
      .mkdir(path.join(APP, "vorlagen", "bibliothek"), { recursive: true })
      .then(() => path.join(APP, "vorlagen", "bibliothek")),
  );

  /*
   * Beide Skripte werden zur Laufzeit gebraucht: das PS-Skript oeffnet das
   * Assistenten-Fenster, setup-python.mjs richtet die Transkription ein. Das
   * zweite ist der Grund, warum im Paket ueberhaupt eingerichtet werden kann
   * — npm gibt es dort nicht, node.exe schon.
   */
  await fs.mkdir(path.join(APP, "scripts"), { recursive: true });
  for (const name of ["assistent-starten.ps1", "setup-python.mjs"]) {
    await fs.copyFile(
      path.join(ROOT, "scripts", name),
      path.join(APP, "scripts", name),
    );
  }

  const tools = path.join(ROOT, "tools");
  if (fsSync.existsSync(tools)) {
    await fs.mkdir(path.join(APP, "tools"), { recursive: true });
    await kopieren(tools, path.join(APP, "tools"));
  }

  // Die eigene node.exe — exakt die Fassung, mit der gebaut wurde.
  await fs.copyFile(process.execPath, path.join(APP, "node.exe"));
  sagen(`  node.exe ${process.version} übernommen`);

  /*
   * Das Programmsymbol. Es liegt in app/, weil die Verknüpfung darauf zeigt
   * und die App es über ihr Arbeitsverzeichnis findet.
   */
  await fs.writeFile(path.join(APP, "mediathek.ico"), buildIcon());
  sagen("  Symbol erzeugt (mediathek.ico)");

  await ffmpegDazu();
  await helferSchreiben();
  await starterSchreiben();
}

/** ffmpeg mitgeben, wenn es auf dieser Maschine liegt. */
async function ffmpegDazu() {
  if (ohneFfmpeg) {
    sagen("  ffmpeg: ausgelassen (--ohne-ffmpeg)");
    return;
  }

  const wo = spawnSync("where", ["ffmpeg"], { encoding: "utf8", shell: true });
  const erste = (wo.stdout ?? "").split(/\r?\n/).find(Boolean);
  if (!erste) {
    sagen("  ffmpeg: nicht gefunden — Kachelbilder fehlen dem Paket.");
    return;
  }

  const binDir = path.dirname(erste.trim());
  const ziel = path.join(APP, "ffmpeg", "bin");
  await fs.mkdir(ziel, { recursive: true });

  /*
   * Der übliche Windows-Build ist ein SHARED build: ffmpeg.exe allein startet
   * nicht, die DLLs daneben gehören dazu. ffplay braucht niemand.
   */
  for (const name of await fs.readdir(binDir)) {
    if (/^ffplay/i.test(name)) continue;
    const quelle = path.join(binDir, name);
    if ((await fs.stat(quelle)).isFile()) {
      await fs.copyFile(quelle, path.join(ziel, name));
    }
  }
  sagen(`  ffmpeg aus ${binDir} übernommen`);
}

/** Zwei winzige Helfer, damit der Starter ohne Klammer-Akrobatik auskommt. */
async function helferSchreiben() {
  await fs.writeFile(
    path.join(APP, "port.js"),
    `/* Sucht einen freien Port und schreibt ihn auf die Standardausgabe. */
const net = require("node:net");
const server = net.createServer();
server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  server.close(() => process.stdout.write(String(port)));
});
`,
    "utf8",
  );

  await fs.writeFile(
    path.join(APP, "start.js"),
    `/*
 * Merkt die eigene Prozesskennung und startet dann den Server.
 *
 * Der Starter braucht sie, um den Server zu beenden, wenn das Fenster zugeht
 * — aus einer cmd-Datei heraus ist die PID eines mit "start /b" gestarteten
 * Prozesses sonst nicht zu bekommen.
 */
const fs = require("node:fs");
const path = require("node:path");

const datei = path.join(process.env.TEMP || __dirname, "mediathek-server.pid");
try {
  fs.writeFileSync(datei, String(process.pid), "utf8");
} catch {
  // Ohne Datei laeuft der Server trotzdem; nur das Aufraeumen wird ungenauer.
}

require("./server.js");
`,
    "utf8",
  );

  await fs.writeFile(
    path.join(APP, "warten.js"),
    `/* Wartet, bis der Server auf dem Port antwortet. Argument: der Port. */
const net = require("node:net");

const port = Number(process.argv[2]);
const frist = Date.now() + 90_000;

function versuch() {
  const socket = net.connect(port, "127.0.0.1");
  socket.on("connect", () => {
    socket.destroy();
    process.exit(0);
  });
  socket.on("error", () => {
    socket.destroy();
    if (Date.now() > frist) process.exit(1);
    setTimeout(versuch, 300);
  });
}

versuch();
`,
    "utf8",
  );
}

// ──────────────────────────────────────────────────────────────── Starter

/*
 * Der Starter ist REIN ASCII — nachgemessen: cmd.exe liest die Datei
 * byteweise, und ein UTF-8-Umlaut hinter einem "chcp 65001" verschiebt das
 * Lesen so, dass aus "setlocal" ein "tlocal" wird und der Start mit
 * "Syntaxfehler" abbricht.
 */
const STARTER = `@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "APP=%~dp0app"
set "NODE=%APP%\\node.exe"

if not exist "%NODE%" (
  echo Die Datei app\\node.exe fehlt - das Paket ist unvollstaendig.
  pause
  exit /b 1
)

rem ---------------------------------------------- Konsole: aus, ausser ...
rem
rem Standardmaessig startet die Mediathek ohne Konsolenfenster. Dieses Skript
rem ruft sich dafuer selbst noch einmal auf - unsichtbar ueber wscript - und
rem beendet sich. Der erste Aufruf blitzt dabei kurz auf; das ist der Preis
rem dafuer, dass es NUR EINE Datei zum Anklicken gibt.
rem
rem Eingeschaltet wird sie auf drei Wegen:
rem   Mediathek.cmd /konsole     - auch in den Eigenschaften einer
rem                                Verknuepfung im Feld "Ziel" anzuhaengen
rem   eine Datei konsole.txt daneben
rem   MEDIATHEK_KONSOLE=1 in der Umgebung
set "KONSOLE="
if /i "%~1"=="/konsole" set "KONSOLE=1"
if /i "%~1"=="-konsole" set "KONSOLE=1"
if /i "%~1"=="/k" set "KONSOLE=1"
if exist "%~dp0konsole.txt" set "KONSOLE=1"
if "%MEDIATHEK_KONSOLE%"=="1" set "KONSOLE=1"

rem "/intern" heisst: das hier IST schon der unsichtbare zweite Aufruf.
set "VERSTECKT="
if /i "%~1"=="/intern" set "VERSTECKT=1"

set "WSCRIPT=%SystemRoot%\\System32\\wscript.exe"

if not defined KONSOLE if not defined VERSTECKT (
  if exist "%WSCRIPT%" (
    start "" "%WSCRIPT%" "%APP%\\ohne-konsole.vbs"
    exit /b 0
  )
  rem Ohne wscript bleibt die Konsole - besser sichtbar als gar kein Start.
  echo Hinweis: wscript.exe fehlt, die Mediathek startet mit Konsolenfenster.
)

rem Eine bibliothek.txt daneben legt den Ordner fest - fuer vorbereitete Pakete.
if exist "%~dp0bibliothek.txt" (
  set /p MEDIATHEK_LIBRARY_DIR=<"%~dp0bibliothek.txt"
)

rem Ohne HOSTNAME bindet Next standalone auf 0.0.0.0 - also im ganzen Netz.
set "HOSTNAME=127.0.0.1"

"%NODE%" "%APP%\\port.js" > "%TEMP%\\mediathek-port.txt"
set /p PORT=<"%TEMP%\\mediathek-port.txt"
if "%PORT%"=="" (
  echo Es liess sich kein freier Port finden.
  pause
  exit /b 1
)

echo Mediathek startet auf 127.0.0.1:%PORT% ...
cd /d "%APP%"
start "Mediathek-Server" /b "%NODE%" "%APP%\\start.js"

"%NODE%" "%APP%\\warten.js" %PORT%
if errorlevel 1 (
  echo Der Server hat nicht geantwortet.
  pause
  goto :aufraeumen
)

rem Ein eigenes Fenster statt eines Browser-Tabs: --app blendet Adresszeile
rem und Lesezeichen aus, --user-data-dir haelt es von einer offenen
rem Browser-Sitzung getrennt UND sorgt dafuer, dass dieser Aufruf wartet,
rem bis das Fenster zugeht. Nur so kann der Server danach beendet werden.
set "FENSTER=%LOCALAPPDATA%\\Mediathek\\fenster"
set "BROWSER="
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"

if defined BROWSER (
  "%BROWSER%" --app=http://127.0.0.1:%PORT% --user-data-dir="%FENSTER%" --window-size=1400,900 --no-first-run --no-default-browser-check
) else (
  echo Weder Edge noch Chrome gefunden - die Mediathek oeffnet im Standardbrowser.
  echo Zum Beenden dieses Fenster schliessen.
  start "" http://127.0.0.1:%PORT%
  pause
)

:aufraeumen
rem Das Fenster ist zu: den Server beenden. /T nimmt auch die Kinder mit,
rem also ein laufendes ffmpeg oder python.
set "PIDDATEI=%TEMP%\\mediathek-server.pid"
if exist "%PIDDATEI%" (
  set /p SERVERPID=<"%PIDDATEI%"
  if defined SERVERPID taskkill /PID !SERVERPID! /T /F >nul 2>&1
  del "%PIDDATEI%" >nul 2>&1
)
endlocal
exit /b 0
`;

const OHNE_KONSOLE = `' Startet Mediathek.cmd ohne Konsolenfenster.
'
' Diese Datei liegt in app/ und wird nicht angeklickt - sie ist das Werkzeug,
' mit dem sich Mediathek.cmd selbst unsichtbar macht. Angeklickt wird immer
' Mediathek.cmd.
'
' Der Pfad kommt aus dem EIGENEN Ort dieser Datei, nicht aus dem aktuellen
' Verzeichnis: gestartet aus einer Verknuepfung heraus sind die beiden nicht
' dasselbe, und dann suchte sie die cmd-Datei an der falschen Stelle.
Set fso = CreateObject("Scripting.FileSystemObject")
appOrdner = fso.GetParentFolderName(WScript.ScriptFullName)
paket = fso.GetParentFolderName(appOrdner)
starter = fso.BuildPath(paket, "Mediathek.cmd")

If Not fso.FileExists(starter) Then
  MsgBox "Mediathek.cmd wurde nicht gefunden:" & vbCrLf & starter, _
    vbExclamation, "Mediathek"
  WScript.Quit 1
End If

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = paket
' "/intern" sagt der cmd-Datei: du bist schon der unsichtbare Aufruf.
' 0 = kein Fenster, False = nicht auf das Ende warten.
shell.Run """" & starter & """ /intern", 0, False
`;

const LIESMICH = `Mediathek
=========

Starten
-------
Doppelklick auf "Mediathek.cmd". Die Mediathek oeffnet sich in einem eigenen
Fenster - ohne Konsole. Beim Start blitzt kurz ein schwarzes Fenster auf, das
ist normal: das Programm macht sich damit selbst unsichtbar.

Beim ersten Start wird gefragt, wo die Bibliothek liegen soll - also der
Ordner mit den Aufnahmen. Man kann einen bestehenden waehlen (etwa auf dem
Netzlaufwerk) oder einen neuen anlegen. Die Antwort wird gemerkt.

Beenden: das Fenster schliessen. Der Server geht mit.

Ganz ohne Aufblitzen, mit Symbol
--------------------------------
Einstellungen -> Programm -> "Verknuepfung auf dem Schreibtisch". Sie startet
direkt unsichtbar und traegt das Programmsymbol. Angelegt wird sie erst auf
Klick, weil sie sich den Pfad merkt - wird der Ordner spaeter verschoben,
einfach eine neue anlegen.

Konsolenfenster einschalten
---------------------------
Wenn etwas klemmt, will man die Meldungen sehen. Drei Wege:

  1. In einer Eingabeaufforderung:   Mediathek.cmd /konsole
  2. In den Eigenschaften einer Verknuepfung im Feld "Ziel" hinten
     " /konsole" anhaengen.
  3. Eine leere Datei "konsole.txt" neben Mediathek.cmd legen. Dann bleibt
     die Konsole dauerhaft an, bis die Datei wieder weg ist.

Was mitgeliefert ist
--------------------
- node.exe        der Server. Nichts zu installieren.
- ffmpeg          fuer Kachelbilder und die Tonspur.
- anleitungen/    die Regeln, nach denen ein KI-Werkzeug schreiben darf.

Was NICHT mitgeliefert ist
--------------------------
- Python und die Whisper-Modelle fuer die Transkription. Die Modelle sind
  mehrere Gigabyte gross; sie werden bei Bedarf einmalig geladen.
  Ohne sie laeuft alles andere - nur transkribiert wird nicht.
- Das KI-Kommandozeilenwerkzeug (voreingestellt "claude"). Ohne es fehlen
  Kapitel, Themen und der Chat; Ansehen, Suchen und Importieren gehen.

Einen festen Bibliotheksordner vorgeben
---------------------------------------
Eine Datei "bibliothek.txt" neben den Starter legen, mit dem Pfad in der
ersten Zeile. Dann wird nicht gefragt, und der Ordner laesst sich in der
Oberflaeche auch nicht umstellen - so gibt man ein vorbereitetes Paket
weiter.

Wenn etwas klemmt
-----------------
Mit "/konsole" starten (siehe oben): dann bleiben die Meldungen stehen. Der
Bildschirm "Einstellungen" sagt ausserdem, welche Werkzeuge gefunden wurden
und wo die Bibliothek liegt.
`;

/**
 * Schreibt eine Datei und besteht darauf, dass sie reines ASCII ist.
 *
 * NACHGEMESSEN, zweimal: cmd.exe liest byteweise. Ein UTF-8-Umlaut hinter
 * `chcp 65001` verschiebt das Lesen (aus `setlocal` wurde `tlocal`), und ein
 * Zeichen, das die ASCII-Kodierung nicht kennt, wird beim Schreiben zu einem
 * NUL-Byte — eine Trennlinie aus Kaestchenzeichen reichte, damit cmd.exe die
 * folgenden Zeilen nicht mehr richtig auswertete.
 *
 * Deshalb wird hier nicht nur mit "ascii" geschrieben, sondern vorher
 * geprueft. Ein Fehlschlag beim Packen ist billiger als ein Starter, der beim
 * Kollegen stumm etwas anderes tut.
 */
async function nurAsciiSchreiben(datei, inhalt) {
  const schlecht = [...inhalt]
    .map((zeichen, i) => [zeichen, i])
    .filter(([zeichen]) => zeichen.charCodeAt(0) > 126);
  if (schlecht.length > 0) {
    const [zeichen, i] = schlecht[0];
    const zeile = inhalt.slice(0, i).split(/\r?\n/).length;
    throw new Error(
      `${path.basename(datei)} ist nicht ASCII: "${zeichen}" ` +
        `(U+${zeichen.charCodeAt(0).toString(16).toUpperCase()}) in Zeile ${zeile}. ` +
        "cmd.exe und wscript lesen byteweise — das wird zu einem NUL-Byte.",
    );
  }
  await fs.writeFile(datei, inhalt, "ascii");
}

async function starterSchreiben() {
  await nurAsciiSchreiben(path.join(DIST, "Mediathek.cmd"), STARTER);
  /*
   * Die VBS liegt in app/ und nicht oben: sie ist Werkzeug, kein Einstieg.
   * Oben steht genau eine Datei zum Anklicken, und die heisst Mediathek.
   */
  await nurAsciiSchreiben(path.join(APP, "ohne-konsole.vbs"), OHNE_KONSOLE);
  await nurAsciiSchreiben(path.join(DIST, "LIESMICH.txt"), LIESMICH);
}

// ────────────────────────────────────────────────────────────────── Pruefen

async function pruefen() {
  sagen("Prüfen …");
  const funde = [];

  async function durchgehen(dir) {
    for (const eintrag of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, eintrag.name);
      const relativ = path.relative(DIST, p);
      /*
       * Geprüft wird gegen den app/-Ordner: dort gilt dieselbe oberste Ebene
       * wie beim Kopieren — mit derselben Ausnahme für `.next`, das dort der
       * Build ist und nicht der Ordner aus dem Projekt.
       */
      const imApp = path.relative(APP, p);
      if (!imApp.startsWith("..") && imApp !== ".next" && verboten(imApp)) {
        funde.push(relativ);
      }
      else if (NIE_UEBERALL.some((muster) => muster.test(relativ))) {
        funde.push(relativ);
      }
      if (eintrag.isDirectory()) await durchgehen(p);
    }
  }
  await durchgehen(DIST);

  const muss = [
    "app/server.js",
    "app/node.exe",
    "app/.next/static",
    "app/vorlagen/bibliothek/anleitungen/kapitel.md",
    "app/mediathek.ico",
    "app/ohne-konsole.vbs",
    "app/scripts/assistent-starten.ps1",
    "app/scripts/setup-python.mjs",
    "app/tools/requirements.txt",
    "Mediathek.cmd",
  ];
  for (const eintrag of muss) {
    if (!fsSync.existsSync(path.join(DIST, eintrag))) {
      funde.push(`FEHLT: ${eintrag}`);
    }
  }

  if (funde.length > 0) {
    throw new Error(`Das Paket stimmt nicht:\n  ${funde.join("\n  ")}`);
  }
  sagen("  nichts Verbotenes, nichts Fehlendes.");
}

// ──────────────────────────────────────────────────────────────────── Smoke

/**
 * Den gepackten Server wirklich starten und eine Seite abrufen.
 *
 * Genau dieser Test faengt den Fehler, der sonst erst beim Kollegen
 * auffaellt: fehlendes `.next/static` — die Seite kommt, aber ohne CSS.
 * Deshalb wird nicht nur auf 200 geprueft, sondern auch darauf, dass die
 * Seite ein Stylesheet nennt und dass es sich laden laesst.
 */
async function smokeTest() {
  sagen("Smoke-Test …");
  const bibliothek = await fs.mkdtemp(path.join(os.tmpdir(), "mediathek-smoke-"));
  await fs.mkdir(path.join(bibliothek, "medien"), { recursive: true });

  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port: frei } = server.address();
      server.close(() => resolve(frei));
    });
    server.on("error", reject);
  });

  const kind = spawn(path.join(APP, "node.exe"), [path.join(APP, "server.js")], {
    cwd: APP,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      MEDIATHEK_LIBRARY_DIR: bibliothek,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let ausgabe = "";
  kind.stdout.on("data", (chunk) => (ausgabe += chunk.toString()));
  kind.stderr.on("data", (chunk) => (ausgabe += chunk.toString()));

  try {
    const frist = Date.now() + 60_000;
    for (;;) {
      if (Date.now() > frist) {
        throw new Error(`Der Server kam nicht hoch:\n${ausgabe.slice(-2000)}`);
      }
      try {
        const antwort = await fetch(`http://127.0.0.1:${port}/`);
        if (!antwort.ok) throw new Error(`Status ${antwort.status}`);
        const html = await antwort.text();

        const treffer = html.match(/\/_next\/static\/[^"']+\.css/);
        if (!treffer) {
          throw new Error(
            "Die Seite nennt kein Stylesheet — sieht nach fehlendem " +
              ".next/static aus.",
          );
        }
        const css = await fetch(`http://127.0.0.1:${port}${treffer[0]}`);
        if (!css.ok) {
          throw new Error(
            `Das Stylesheet fehlt (${css.status}) — .next/static ist nicht mitgekommen.`,
          );
        }
        sagen(`  200 auf / , Stylesheet geladen (${treffer[0]})`);
        break;
      } catch (fehler) {
        if (String(fehler).includes("Stylesheet") || String(fehler).includes("Status")) {
          throw fehler;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  } finally {
    kind.kill();
    await fs.rm(bibliothek, { recursive: true, force: true }).catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────────── Lauf

try {
  if (!nurSmoke) {
    await bauen();
    await zusammenstellen();
    await pruefen();
  }
  if (smoke) await smokeTest();

  const bytes = await groesse(DIST);
  sagen("");
  sagen(`Fertig: ${DIST}`);
  sagen(`Größe: ${mb(bytes)}`);
  sagen("Zum Weitergeben den Ordner kopieren — nicht zippen.");
  sagen(
    "(Aus einem ZIP trägt jede Datei das Mark-of-the-Web, und Windows " +
      "blockiert den Start.)",
  );
} catch (fehler) {
  process.stderr.write(`\n${fehler instanceof Error ? fehler.message : fehler}\n`);
  process.exit(1);
}
