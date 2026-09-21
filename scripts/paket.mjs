/*
 * Baut das weitergebbare Paket: ein Ordner, den man kopiert und startet.
 *
 *   node scripts/paket.mjs [--ohne-ffmpeg] [--smoke]
 *
 * ZIEL: keine Installation. Wer den Ordner bekommt, macht einen Doppelklick.
 * Deshalb liegen node und ffmpeg mit im Paket — die einzige Ausnahme
 * bleibt Python für die Transkription, weil dort Modelle von mehreren
 * Gigabyte dazugehören, die niemand mitkopieren will.
 *
 * Das Skript baut die Fassung der Maschine, auf der es läuft: unter Windows
 * den Ordner mit Mediathek.cmd, unter macOS Mediathek.app. Zwei Pakete aus
 * derselben Quelle, weil node und ffmpeg der anderen Architektur dort nicht
 * laufen.
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
 * 3. **Das Arbeitsverzeichnis ist `app/`.** Unter macOS liegt dieser Ordner
 *    in `Mediathek.app/Contents/Resources/app`. `vorlagen/`, `scripts/`,
 *    `tools/` und `ffmpeg/bin` werden zur Laufzeit gegen `process.cwd()`
 *    aufgelöst — sie müssen dort drin liegen, sonst fehlt dem Autorenmodus
 *    die halbe Ausstattung.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { buildIcon, buildIcns } from "./icon.mjs";
import pkg from "../package.json" with { type: "json" };

const ROOT = process.cwd();
const DARWIN = process.platform === "darwin";
const NODE_NAME = DARWIN ? "node" : "node.exe";
const DIST = path.join(ROOT, "dist", "Mediathek");
const BUNDLE = path.join(DIST, "Mediathek.app");
const APP = DARWIN
  ? path.join(BUNDLE, "Contents", "Resources", "app")
  : path.join(DIST, "app");

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
  if (DARWIN) {
    await fs.mkdir(path.join(BUNDLE, "Contents", "MacOS"), { recursive: true });
    await fs.mkdir(path.join(BUNDLE, "Contents", "Resources"), {
      recursive: true,
    });
  }

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
   * Die Startskripte werden zur Laufzeit gebraucht: das PS-Skript (Windows)
   * bzw. das Shell-Skript (macOS) oeffnet das Assistenten-Fenster,
   * setup-python.mjs richtet die Transkription ein. Das zweite ist der Grund,
   * warum im Paket ueberhaupt eingerichtet werden kann — npm gibt es dort
   * nicht, node schon.
   */
  await fs.mkdir(path.join(APP, "scripts"), { recursive: true });
  for (const name of [
    "assistent-starten.ps1",
    "assistent-starten.sh",
    "setup-python.mjs",
  ]) {
    const ziel = path.join(APP, "scripts", name);
    await fs.copyFile(path.join(ROOT, "scripts", name), ziel);
    if (name.endsWith(".sh")) await fs.chmod(ziel, 0o755);
  }

  const tools = path.join(ROOT, "tools");
  if (fsSync.existsSync(tools)) {
    await fs.mkdir(path.join(APP, "tools"), { recursive: true });
    await kopieren(tools, path.join(APP, "tools"));
  }

  await nodeDazu();

  /*
   * Das Programmsymbol. Unter Windows liegt es in app/, weil die Verknüpfung
   * darauf zeigt. Unter macOS gehört es ins Bundle (Resources/mediathek.icns).
   */
  if (DARWIN) {
    buildIcns(path.join(BUNDLE, "Contents", "Resources", "mediathek.icns"));
    sagen("  Symbol erzeugt (mediathek.icns)");
  } else {
    await fs.writeFile(path.join(APP, "mediathek.ico"), buildIcon());
    sagen("  Symbol erzeugt (mediathek.ico)");
  }

  await ffmpegDazu();
  await helferSchreiben();
  await starterSchreiben();
}

/** Die Node-Binärdatei — unter macOS eine eigenständige Fassung, kein Homebrew. */
async function nodeDazu() {
  const ziel = path.join(APP, NODE_NAME);
  if (!DARWIN) {
    await fs.copyFile(process.execPath, ziel);
    sagen(`  ${NODE_NAME} ${process.version} übernommen`);
    return;
  }

  const echt = await fs.realpath(process.execPath);
  if (machONurSystem(echt)) {
    await fs.copyFile(echt, ziel);
    await fs.chmod(ziel, 0o755);
    sagen(`  ${NODE_NAME} ${process.version} übernommen (eigenständig)`);
    return;
  }

  try {
    await nodeOffiziellHolen(ziel);
    sagen(`  ${NODE_NAME} ${process.version} von nodejs.org (${process.arch})`);
  } catch (fehler) {
    sagen(
      `  Offizielle node-Binärdatei nicht geladen (${
        fehler instanceof Error ? fehler.message : fehler
      }) — nimm die lokale mit Bibliotheken mit.`,
    );
    await machOMitnehmen(echt, path.dirname(ziel), NODE_NAME);
    sagen(`  ${NODE_NAME} ${process.version} mit Bibliotheken übernommen`);
  }

  await fs.chmod(ziel, 0o755);
  const probe = spawnSync(ziel, ["-e", "process.stdout.write(process.version)"], {
    encoding: "utf8",
  });
  if (probe.status !== 0) {
    throw new Error(
      `Die mitgelieferte node-Binärdatei startet nicht: ${
        (probe.stderr || probe.stdout || "").trim()
      }`,
    );
  }
}

async function nodeOffiziellHolen(ziel) {
  const version = process.version.replace(/^v/, "");
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const name = `node-v${version}-darwin-${arch}`;
  const url = `https://nodejs.org/dist/v${version}/${name}.tar.gz`;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mediathek-node-"));
  const tarball = path.join(tmp, `${name}.tar.gz`);
  try {
    sagen(`  node ${process.version} von nodejs.org laden …`);
    const antwort = await fetch(url, { redirect: "follow" });
    if (!antwort.ok) {
      throw new Error(`${url} → ${antwort.status}`);
    }
    await fs.writeFile(tarball, Buffer.from(await antwort.arrayBuffer()));
    const entpacken = spawnSync(
      "tar",
      ["-xzf", tarball, "-C", tmp, `${name}/bin/node`],
      { encoding: "utf8" },
    );
    if (entpacken.status !== 0) {
      throw new Error((entpacken.stderr || "tar fehlgeschlagen").trim());
    }
    const binaer = path.join(tmp, name, "bin", "node");
    await fs.copyFile(binaer, ziel);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/** ffmpeg mitgeben, wenn es auf dieser Maschine liegt. */
async function ffmpegDazu() {
  if (ohneFfmpeg) {
    sagen("  ffmpeg: ausgelassen (--ohne-ffmpeg)");
    return;
  }

  if (DARWIN) {
    const wo = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
    const erste = (wo.stdout ?? "").split(/\r?\n/).find(Boolean);
    if (!erste) {
      sagen("  ffmpeg: nicht gefunden — Kachelbilder fehlen dem Paket.");
      return;
    }
    const quelle = erste.trim();
    const binDir = path.dirname(await fs.realpath(quelle));
    const ziel = path.join(APP, "ffmpeg", "bin");
    await fs.mkdir(ziel, { recursive: true });
    await machOMitnehmen(quelle, ziel, "ffmpeg");
    const ffprobe = path.join(binDir, "ffprobe");
    if (fsSync.existsSync(ffprobe)) {
      await machOMitnehmen(ffprobe, ziel, "ffprobe");
    }
    const probe = spawnSync(path.join(ziel, "ffmpeg"), ["-version"], {
      encoding: "utf8",
    });
    if (probe.status !== 0) {
      throw new Error(
        `Das mitgelieferte ffmpeg startet nicht: ${
          (probe.stderr || probe.stdout || "").trim().slice(0, 300)
        }`,
      );
    }
    sagen(`  ffmpeg aus ${binDir} übernommen (mit Bibliotheken)`);
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

const SYSTEM_DYLIB = /^(?:\/usr\/lib\/|\/System\/|\/Library\/Apple\/)/;

function machONurSystem(datei) {
  const deps = machODeps(datei);
  return deps.every(
    (dep) =>
      SYSTEM_DYLIB.test(dep) ||
      dep.startsWith("@executable_path/") ||
      dep === datei,
  );
}

function machODeps(datei) {
  const lauf = spawnSync("otool", ["-L", datei], { encoding: "utf8" });
  if (lauf.status !== 0) return [];
  const deps = [];
  for (const zeile of lauf.stdout.split("\n").slice(1)) {
    const m = zeile.trim().match(/^(.+?)\s+\(compatibility/);
    if (m) deps.push(m[1]);
  }
  return deps;
}

function machORpaths(datei) {
  const lauf = spawnSync("otool", ["-l", datei], { encoding: "utf8" });
  if (lauf.status !== 0) return [];
  const pfade = [];
  const zeilen = lauf.stdout.split("\n");
  for (let i = 0; i < zeilen.length; i += 1) {
    if (!zeilen[i].includes("LC_RPATH")) continue;
    for (let j = i + 1; j < i + 6 && j < zeilen.length; j += 1) {
      const m = zeilen[j].match(/path\s+(\S+)/);
      if (m) {
        pfade.push(m[1]);
        break;
      }
    }
  }
  return pfade;
}

function rpathAufloesen(dep, binaer, rpaths) {
  if (!dep.startsWith("@")) return dep;
  const dir = path.dirname(binaer);
  if (dep.startsWith("@loader_path/")) {
    return path.resolve(dir, dep.slice("@loader_path/".length));
  }
  if (dep.startsWith("@executable_path/")) {
    return path.resolve(dir, dep.slice("@executable_path/".length));
  }
  if (dep.startsWith("@rpath/")) {
    const rest = dep.slice("@rpath/".length);
    for (const rp of rpaths) {
      const basis = rp
        .replace("@loader_path", dir)
        .replace("@executable_path", dir);
      const kandidat = path.resolve(basis, rest);
      if (fsSync.existsSync(kandidat)) return kandidat;
    }
  }
  return null;
}

/**
 * Kopiert eine Mach-O-Binärdatei samt nicht-systemischer dylibs und schreibt
 * die Install-Namen auf @executable_path um. Danach ad-hoc signieren —
 * sonst weigert sich Apple Silicon, die angefasste Datei zu starten.
 */
async function machOMitnehmen(quelle, zielDir, dateiname) {
  await fs.mkdir(zielDir, { recursive: true });
  const echt = await fs.realpath(quelle);
  const ziel = path.join(zielDir, dateiname);
  await fs.copyFile(echt, ziel);
  await fs.chmod(ziel, 0o755);

  const gesehen = new Set(
    (await fs.readdir(zielDir)).filter((n) => n !== dateiname),
  );
  await dylibsSammeln(echt, ziel, zielDir, gesehen);

  for (const name of await fs.readdir(zielDir)) {
    spawnSync("codesign", ["-s", "-", "--force", path.join(zielDir, name)], {
      stdio: "ignore",
    });
  }
}

async function dylibsSammeln(originalPfad, kopie, zielDir, gesehen) {
  const rpaths = machORpaths(originalPfad);
  for (const dep of machODeps(kopie)) {
    const aufgeloest = rpathAufloesen(dep, originalPfad, rpaths);
    if (!aufgeloest || SYSTEM_DYLIB.test(aufgeloest)) continue;
    let echt;
    try {
      echt = await fs.realpath(aufgeloest);
    } catch {
      continue;
    }
    if (echt === originalPfad) continue;

    const base = path.basename(echt);
    const dest = path.join(zielDir, base);
    if (!gesehen.has(base)) {
      gesehen.add(base);
      await fs.copyFile(echt, dest);
      await fs.chmod(dest, 0o755);
      spawnSync("install_name_tool", ["-id", `@executable_path/${base}`, dest], {
        stdio: "ignore",
      });
      await dylibsSammeln(echt, dest, zielDir, gesehen);
    }
    if (dep !== `@executable_path/${base}`) {
      spawnSync(
        "install_name_tool",
        ["-change", dep, `@executable_path/${base}`, kopie],
        { stdio: "ignore" },
      );
    }
  }
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

  await fs.writeFile(
    path.join(APP, "warten-ende.js"),
    `/*
 * Wartet, bis die Mediathek zu beenden ist — Windows und macOS.
 *
 * Zwei Ausloeser:
 *   1. Das Fenster ist zu (kein Renderer mehr mit unserem --user-data-dir).
 *      Chrome/Edge lassen den Prozess sonst im Dock/SysTray stehen.
 *   2. Der Server antwortet nicht mehr (Knopf "Mediathek beenden").
 *
 * Danach werden die Browser-Prozesse mit diesem Profil beendet.
 */
const { spawnSync } = require("node:child_process");
const net = require("node:net");

const port = Number(process.argv[2]);
const marker = process.argv[3] || "";
if (!port || !marker || marker.length < 8) process.exit(1);

function schlafen(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portOffen() {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function zeilenMitMarker() {
  if (process.platform === "win32") {
    const escaped = marker.replace(/'/g, "''");
    const cmd =
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and " +
      "$_.CommandLine.Contains('" +
      escaped +
      "') } | ForEach-Object { " +
      "$_.ProcessId.ToString() + '|' + $_.CommandLine }";
    const lauf = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", cmd],
      { encoding: "utf8", windowsHide: true, timeout: 8000 },
    );
    return (lauf.stdout || "")
      .split(/\\r?\\n/)
      .map((z) => z.trim())
      .filter(Boolean);
  }
  const lauf = spawnSync("ps", ["-ax", "-o", "pid=,command="], {
    encoding: "utf8",
  });
  return (lauf.stdout || "")
    .split("\\n")
    .map((z) => z.trim())
    .filter((z) => z.includes(marker));
}

function hatFenster() {
  return zeilenMitMarker().some((z) => z.includes("--type=renderer"));
}

function hatProfil() {
  return zeilenMitMarker().length > 0;
}

function profilBeenden() {
  for (const zeile of zeilenMitMarker()) {
    const pid = Number(zeile.split(/[|\\s]/)[0]);
    if (!pid) continue;
    try {
      process.kill(pid);
    } catch {
      // schon weg
    }
  }
  if (process.platform === "win32") {
    spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and " +
          "$_.CommandLine.Contains('" +
          marker.replace(/'/g, "''") +
          "') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
      ],
      { windowsHide: true, timeout: 8000 },
    );
  }
}

async function main() {
  const anfang = Date.now();
  let gesehen = false;
  while (Date.now() - anfang < 16_000) {
    if (!(await portOffen())) {
      profilBeenden();
      process.exit(0);
    }
    if (hatFenster()) {
      gesehen = true;
      break;
    }
    await schlafen(200);
  }

  let weg = 0;
  for (;;) {
    if (!(await portOffen())) break;
    if (hatFenster()) {
      weg = 0;
    } else if (!gesehen) {
      await schlafen(400);
      continue;
    } else {
      weg += 1;
      if (weg >= 4) break;
    }
    if (!hatProfil() && gesehen) break;
    await schlafen(250);
  }

  profilBeenden();
  process.exit(0);
}

main();
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

rem Eigenes Fenster: --app, eigenes Profil. Edge, sonst Chrome, sonst Brave.
rem x am Fenster ODER Knopf "Mediathek beenden": warten-ende.js kehrt zurueck.
set "FENSTER=%LOCALAPPDATA%\\Mediathek\\fenster"
set "BROWSER="
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" set "BROWSER=%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" set "BROWSER=%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"

if defined BROWSER (
  start "" "%BROWSER%" --app=http://127.0.0.1:%PORT% --user-data-dir="%FENSTER%" --window-size=1400,900 --no-first-run --no-default-browser-check
  "%NODE%" "%APP%\\warten-ende.js" %PORT% "%FENSTER%"
) else (
  echo Weder Edge noch Chrome noch Brave gefunden - Standardbrowser.
  echo Zum Beenden den Knopf in der App oder dieses Fenster schliessen.
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

Beenden: das Fenster schliessen (x), den Knopf "Mediathek beenden"
(Werkzeuge-Menue oder Einstellungen), oder die Konsole. Der Server geht mit.

Edge ist nicht Pflicht, sonst Chrome oder Brave. Fehlt alles, oeffnet der
Standardbrowser; dann die Konsole schliessen zum Beenden.

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

const STARTER_MAC = `#!/bin/bash
# Startet die Mediathek als .app: Server im Hintergrund, eigenes Fenster.
set -euo pipefail

MACOS="$(cd "$(dirname "$0")" && pwd)"
CONTENTS="$(cd "$MACOS/.." && pwd)"
BUNDLE="$(cd "$CONTENTS/.." && pwd)"
PACKET="$(cd "$BUNDLE/.." && pwd)"
APP_DIR="$CONTENTS/Resources/app"
NODE="$APP_DIR/node"

if [ ! -x "$NODE" ]; then
  osascript -e 'display alert "Mediathek" message "Die Datei Contents/Resources/app/node fehlt — das Paket ist unvollständig." as critical'
  exit 1
fi

KONSOLE=""
case "\${1:-}" in
  /konsole|-konsole|--konsole) KONSOLE=1 ;;
esac
if [ -f "\$PACKET/konsole.txt" ] || [ -f "\$BUNDLE/konsole.txt" ]; then
  KONSOLE=1
fi
if [ "\${MEDIATHEK_KONSOLE:-}" = "1" ]; then
  KONSOLE=1
fi

if [ -f "\$PACKET/bibliothek.txt" ]; then
  MEDIATHEK_LIBRARY_DIR="$(head -n 1 "\$PACKET/bibliothek.txt" | tr -d '\\r')"
  export MEDIATHEK_LIBRARY_DIR
fi

export HOSTNAME=127.0.0.1
export NODE_ENV=production

if [ -d "\$APP_DIR/ffmpeg/bin" ]; then
  export MEDIATHEK_FFMPEG_DIR="\$APP_DIR/ffmpeg/bin"
  export PATH="\$APP_DIR/ffmpeg/bin:\$PATH"
fi

LOGDIR="\$HOME/Library/Logs/Mediathek"
mkdir -p "\$LOGDIR"
LOG="\$LOGDIR/server.log"

cd "\$APP_DIR"

PORT="\$("\$NODE" "\$APP_DIR/port.js")"
if [ -z "\$PORT" ]; then
  osascript -e 'display alert "Mediathek" message "Es ließ sich kein freier Port finden." as critical'
  exit 1
fi
export PORT

killtree() {
  _pid="\$1"
  for _child in $(pgrep -P "\$_pid" 2>/dev/null || true); do
    killtree "\$_child"
  done
  kill -TERM "\$_pid" 2>/dev/null || true
}

FENSTER="\$HOME/Library/Application Support/Mediathek/fenster"
mkdir -p "\$FENSTER"

cleanup() {
  if [ -n "\${SERVER_PID:-}" ]; then
    killtree "\$SERVER_PID"
    wait "\$SERVER_PID" 2>/dev/null || true
  fi
  pkill -f "--user-data-dir=\${FENSTER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

"\$NODE" "\$APP_DIR/server.js" >>"\$LOG" 2>&1 &
SERVER_PID=\$!

if ! "\$NODE" "\$APP_DIR/warten.js" "\$PORT"; then
  osascript -e 'display alert "Mediathek" message "Der Server hat nicht geantwortet. Einzelheiten stehen in ~/Library/Logs/Mediathek/server.log." as critical'
  exit 1
fi

# Altes Profil-Fenster weg, sonst klebt Chrome am toten Port.
pkill -f "--user-data-dir=\${FENSTER}" >/dev/null 2>&1 || true
sleep 0.4
rm -f "\$FENSTER/SingletonLock" "\$FENSTER/SingletonSocket" "\$FENSTER/SingletonCookie"

if [ -n "\$KONSOLE" ]; then
  open -a Console "\$LOG" || true
fi

# Chrome ist NICHT Pflicht. Chromium-Familie kann ein eigenes Fenster
# (--app). Sonst der Standardbrowser (oft Safari).
#
# Das rote x soll sauber beenden: Chrome lässt den Prozess oft im Dock
# stehen, ohne das --app-Fenster. Wir merken das am Renderer-Prozess
# (das Fenster) und räumen dann Server plus Chrome-Profil weg.
BROWSER=""
for kandidat in \\
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
  "\$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \\
  "\$HOME/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \\
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \\
  "\$HOME/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \\
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
do
  if [ -x "\$kandidat" ]; then
    BROWSER="\$kandidat"
    break
  fi
done

if [ -n "\$BROWSER" ]; then
  "\$BROWSER" \\
    --app="http://127.0.0.1:\$PORT" \\
    --user-data-dir="\$FENSTER" \\
    --window-size=1400,900 \\
    --no-first-run \\
    --no-default-browser-check \\
    --disable-background-mode \\
    >/dev/null 2>&1 &
  "\$NODE" "\$APP_DIR/warten-ende.js" "\$PORT" "\$FENSTER"
else
  echo "Kein Chrome/Edge/Brave — Standardbrowser." >>"\$LOG"
  open "http://127.0.0.1:\$PORT"
  osascript -e 'display notification "Kein Chrome/Edge/Brave gefunden. Beenden: Knopf in der App oder Mediathek im Dock." with title "Mediathek"'
  wait "\$SERVER_PID" || true
fi
`;

const PAKET_COMMAND = `#!/bin/bash
# Sichtbarer Start: dieselben Schritte wie Mediathek.app, mit Terminal.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x "Mediathek.app/Contents/MacOS/mediathek" ]; then
  echo "Mediathek.app fehlt neben dieser Datei."
  read -r _
  exit 1
fi
exec "Mediathek.app/Contents/MacOS/mediathek" "$@"
`;

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Mediathek</string>
  <key>CFBundleDisplayName</key>
  <string>Mediathek</string>
  <key>CFBundleIdentifier</key>
  <string>web.simon91.mediathek</string>
  <key>CFBundleVersion</key>
  <string>${pkg.version}</string>
  <key>CFBundleShortVersionString</key>
  <string>${pkg.version}</string>
  <key>CFBundleExecutable</key>
  <string>mediathek</string>
  <key>CFBundleIconFile</key>
  <string>mediathek</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>LSArchitecturePriority</key>
  <array>
    <string>${process.arch === "arm64" ? "arm64" : "x86_64"}</string>
  </array>
</dict>
</plist>
`;

const LIESMICH_MAC = `Mediathek
=========

Starten
-------
Doppelklick auf „Mediathek.app“. Die Mediathek öffnet sich in einem eigenen
Fenster — ohne Terminal.

Beenden: das rote x am Fenster, den Knopf „Mediathek beenden" in der App,
oder Mediathek im Dock (cmd+Q). In allen Fällen geht der Server mit — es
bleibt kein leeres Chrome-Symbol im Dock.

Chrome ist nicht nötig. Vorhanden werden der Reihe nach genutzt: Chrome,
Edge, Brave, Chromium — die können ein eigenes Fenster ohne Tab-Leiste.
Fehlt alles davon, öffnet sich der Standardbrowser (oft Safari).

Falls die App stumm bleibt: „Mediathek starten.command“ daneben — dann sieht
man die Meldungen im Terminal.

Beim ersten Start wird gefragt, wo die Bibliothek liegen soll — also der
Ordner mit den Aufnahmen. Man kann einen bestehenden wählen (etwa auf dem
Netzlaufwerk) oder einen neuen anlegen. Die Antwort wird gemerkt.

Architektur dieses Pakets: ${process.arch}
(arm64 = Apple Silicon, x64 = Intel. Ein Paket läuft nicht auf der anderen.)

Gatekeeper
----------
Das Programm ist nicht von Apple notariert. Wurde es von einer anderen
Maschine kopiert, verweigert macOS den Start („kann nicht geöffnet werden,
da der Entwickler nicht verifiziert werden kann“). Beim ersten Mal:

  Rechtsklick auf Mediathek.app → Öffnen → Öffnen

Oder in einem Terminal:

  xattr -cr Mediathek.app

Ganz ohne Terminal, mit Symbol
------------------------------
Einstellungen → Programm → „Verknüpfung auf dem Schreibtisch“. Sie zeigt
auf diesen Ort — wird der Ordner später verschoben, einfach eine neue
anlegen.

Konsolenfenster / Protokoll
---------------------------
Wenn etwas klemmt, will man die Meldungen sehen.

  1. Eine leere Datei „konsole.txt“ neben Mediathek.app legen. Dann öffnet
     sich die Konsole mit dem Server-Protokoll.
  2. Das Protokoll liegt unter ~/Library/Logs/Mediathek/server.log.

Was mitgeliefert ist
--------------------
- node          der Server. Nichts zu installieren.
- ffmpeg        für Kachelbilder und die Tonspur.
- anleitungen/  die Regeln, nach denen ein KI-Werkzeug schreiben darf.

Was NICHT mitgeliefert ist
--------------------------
- Python und die Whisper-Modelle für die Transkription. Die Modelle sind
  mehrere Gigabyte groß; sie werden bei Bedarf einmalig geladen.
  Ohne sie läuft alles andere — nur transkribiert wird nicht.
- Das KI-Kommandozeilenwerkzeug (voreingestellt „claude“). Ohne es fehlen
  Kapitel, Themen und der Chat; Ansehen, Suchen und Importieren gehen.

Einen festen Bibliotheksordner vorgeben
---------------------------------------
Eine Datei „bibliothek.txt“ neben Mediathek.app legen, mit dem Pfad in der
ersten Zeile. Dann wird nicht gefragt, und der Ordner lässt sich in der
Oberfläche auch nicht umstellen — so gibt man ein vorbereitetes Paket
weiter.

Wenn etwas klemmt
-----------------
Das Protokoll unter ~/Library/Logs/Mediathek/server.log lesen. Der Bildschirm
„Einstellungen“ sagt außerdem, welche Werkzeuge gefunden wurden und wo die
Bibliothek liegt.
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
  if (DARWIN) {
    const launcher = path.join(BUNDLE, "Contents", "MacOS", "mediathek");
    await fs.writeFile(launcher, STARTER_MAC, "utf8");
    await fs.chmod(launcher, 0o755);
    await fs.writeFile(
      path.join(BUNDLE, "Contents", "Info.plist"),
      INFO_PLIST,
      "utf8",
    );
    await fs.writeFile(path.join(DIST, "LIESMICH.txt"), LIESMICH_MAC, "utf8");
    const commandDatei = path.join(DIST, "Mediathek starten.command");
    await fs.writeFile(commandDatei, PAKET_COMMAND, "utf8");
    await fs.chmod(commandDatei, 0o755);
    const signatur = spawnSync(
      "codesign",
      ["--force", "--deep", "--sign", "-", BUNDLE],
      { encoding: "utf8" },
    );
    if (signatur.status !== 0) {
      sagen(
        `  Hinweis: ad-hoc-Signatur fehlgeschlagen (${(
          signatur.stderr || ""
        ).trim()}). Der erste Start auf diesem Mac kann haken.`,
      );
    } else {
      sagen("  ad-hoc signiert (für diesen Mac; beim Kollegen Gatekeeper, siehe LIESMICH)");
    }
    return;
  }

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

  const quellen = [
    "Mediathek starten.bat",
    "Mediathek starten.command",
    "scripts/assistent-starten.ps1",
    "scripts/assistent-starten.sh",
  ];
  for (const quelle of quellen) {
    if (!fsSync.existsSync(path.join(ROOT, quelle))) {
      funde.push(`QUELLE FEHLT: ${quelle}`);
    }
  }

  const muss = DARWIN
    ? [
        "Mediathek.app/Contents/MacOS/mediathek",
        "Mediathek.app/Contents/Info.plist",
        "Mediathek.app/Contents/Resources/mediathek.icns",
        "Mediathek.app/Contents/Resources/app/server.js",
        "Mediathek.app/Contents/Resources/app/warten-ende.js",
        "Mediathek.app/Contents/Resources/app/node",
        "Mediathek.app/Contents/Resources/app/.next/static",
        "Mediathek.app/Contents/Resources/app/vorlagen/bibliothek/anleitungen/kapitel.md",
        "Mediathek.app/Contents/Resources/app/scripts/assistent-starten.sh",
        "Mediathek.app/Contents/Resources/app/scripts/setup-python.mjs",
        "Mediathek.app/Contents/Resources/app/tools/requirements.txt",
        "LIESMICH.txt",
        "Mediathek starten.command",
      ]
    : [
        "app/server.js",
        "app/warten-ende.js",
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

  const kind = spawn(path.join(APP, NODE_NAME), [path.join(APP, "server.js")], {
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
  if (DARWIN) {
    sagen("Zum Weitergeben den Ordner kopieren.");
    sagen(
      `Dieses Paket ist ${process.arch} (${
        process.arch === "arm64" ? "Apple Silicon" : "Intel"
      }).`,
    );
    sagen(
      "Beim Kollegen: Rechtsklick → Öffnen (Gatekeeper), siehe LIESMICH.txt.",
    );
  } else {
    sagen("Zum Weitergeben den Ordner kopieren — nicht zippen.");
    sagen(
      "(Aus einem ZIP trägt jede Datei das Mark-of-the-Web, und Windows " +
        "blockiert den Start.)",
    );
  }
} catch (fehler) {
  process.stderr.write(`\n${fehler instanceof Error ? fehler.message : fehler}\n`);
  process.exit(1);
}
