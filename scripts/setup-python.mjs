/*
 * Richtet die Python-Umgebung für die Transkription ein.
 *
 *   npm run setup:python
 *
 * Ein Node-Skript, damit es aus cmd, PowerShell und der Entwicklungsumgebung
 * gleich läuft. Das venv liegt unter tools/, NICHT in der Projektwurzel —
 * sonst läuft der Next-Build hinein.
 *
 * Wer nur zusehen will, braucht das alles nicht: Transkription ist reine
 * Autorensache.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const TOOLS = path.join(ROOT, "tools");
const VENV = path.join(TOOLS, ".venv");
const VENV_PYTHON =
  process.platform === "win32"
    ? path.join(VENV, "Scripts", "python.exe")
    : path.join(VENV, "bin", "python");

const CPU_ONLY = process.argv.includes("--cpu");

function say(message) {
  console.log(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  return result.status === 0;
}

/** Findet einen brauchbaren Python-Interpreter. Mindestens 3.11. */
function findPython() {
  const candidates = [];
  if (process.env.PYTHON_EXE) candidates.push(process.env.PYTHON_EXE);

  if (process.platform === "win32") {
    // Der py-Launcher kennt alle installierten Fassungen.
    for (const version of ["3.14", "3.13", "3.12", "3.11"]) {
      const probe = spawnSync("py", [`-${version}`, "-c", "import sys;print(sys.executable)"], {
        encoding: "utf8",
        windowsHide: true,
      });
      if (probe.status === 0) {
        const found = probe.stdout.trim();
        if (found) candidates.push(found);
      }
    }
  }
  candidates.push("python3", "python");

  for (const candidate of candidates) {
    const probe = spawnSync(
      candidate,
      ["-c", "import sys;print('%d.%d' % sys.version_info[:2])"],
      { encoding: "utf8", windowsHide: true },
    );
    if (probe.status !== 0) continue;
    const [major, minor] = probe.stdout.trim().split(".").map(Number);
    if (major === 3 && minor >= 11) {
      return { exe: candidate, version: `${major}.${minor}` };
    }
  }
  return null;
}

/** Sucht ffmpeg — dieselbe Reihenfolge wie der Server. */
function findFfmpegDir() {
  const candidates = [
    process.env.MEDIATHEK_FFMPEG_DIR,
    // Im weitergegebenen Paket liegt ffmpeg neben der Anwendung.
    path.join(ROOT, "ffmpeg", "bin"),
    "C:\\ffmpeg-master-latest-win64-gpl-shared\\bin",
  ].filter(Boolean);

  for (const dir of candidates) {
    const exe = path.join(dir, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
    if (spawnSync(exe, ["-version"], { stdio: "ignore", windowsHide: true }).status === 0) {
      return dir;
    }
  }
  if (spawnSync("ffprobe", ["-version"], { stdio: "ignore", windowsHide: true }).status === 0) {
    return null; // Über den Suchpfad erreichbar.
  }
  return undefined; // Nicht gefunden.
}

async function main() {
  say("Mediathek — Python-Umgebung für die Transkription\n");

  const python = findPython();
  if (!python) {
    console.error(
      "Kein Python ab 3.11 gefunden.\n" +
        "Installieren von python.org, dann diesen Befehl erneut ausführen.\n" +
        "Ein bestimmter Interpreter lässt sich über PYTHON_EXE vorgeben.",
    );
    process.exit(1);
  }
  say(`Python ${python.version}: ${python.exe}`);

  if (!fs.existsSync(VENV_PYTHON)) {
    say(`Umgebung wird angelegt: ${VENV}`);
    if (!run(python.exe, ["-m", "venv", VENV])) {
      console.error("Die Umgebung konnte nicht angelegt werden.");
      process.exit(1);
    }
  } else {
    say(`Umgebung ist vorhanden: ${VENV}`);
  }

  say("\npip wird aktualisiert …");
  run(VENV_PYTHON, ["-m", "pip", "install", "--quiet", "--upgrade", "pip"]);

  const requirements = path.join(
    TOOLS,
    CPU_ONLY ? "requirements-cpu.txt" : "requirements.txt",
  );
  say(`\nPakete werden installiert (${path.basename(requirements)}) …`);
  say("Das dauert beim ersten Mal einige Minuten.\n");
  if (!run(VENV_PYTHON, ["-m", "pip", "install", "-r", requirements])) {
    console.error(
      "\nDie Installation ist fehlgeschlagen.\n" +
        "Bei einer Maschine ohne NVIDIA-Karte hilft: npm run setup:python -- --cpu",
    );
    process.exit(1);
  }

  const ffmpegDir = findFfmpegDir();
  if (ffmpegDir === undefined) {
    say(
      "\nHinweis: ffmpeg wurde nicht gefunden. Die Transkription braucht es, " +
        "um die Tonspur zu lesen.\nDen Ordner mit ffmpeg und ffprobe " +
        "unter Einstellungen eintragen.",
    );
  } else {
    say(`\nffmpeg: ${ffmpegDir ?? "über den Suchpfad"}`);
  }

  say("\nProbelauf — wird die Grafikkarte genutzt?\n");
  await probe(ffmpegDir);
}

/**
 * Ruft transcribe.py mit --probe-only auf und übersetzt die JSON-Lines in
 * Klartext. Der Probelauf fährt ein echtes Encode, nicht bloß ein
 * Modell-Laden: ein fehlendes cublas64_12.dll fällt sonst erst mitten im
 * ersten richtigen Lauf auf.
 */
function probe(ffmpegDir) {
  return new Promise((resolve) => {
    const cublas = path.join(
      VENV,
      "Lib",
      "site-packages",
      "nvidia",
      "cublas",
      "bin",
    );
    const pathParts = [cublas, ffmpegDir, process.env.PATH].filter(Boolean);

    const child = spawn(
      VENV_PYTHON,
      [path.join(TOOLS, "transcribe.py"), "--probe-only", "--model", "small"],
      {
        cwd: TOOLS,
        windowsHide: true,
        env: {
          ...process.env,
          // Ohne das stirbt der Lauf am ersten Umlaut: Python 3.14 nutzt
          // beim Pipe cp1252.
          PYTHONUTF8: "1",
          PYTHONUNBUFFERED: "1",
          PATH: pathParts.join(path.delimiter),
        },
      },
    );

    let buffer = "";
    let device = null;

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "hello") {
          say(
            `faster-whisper ${event.faster_whisper}, ctranslate2 ${event.ctranslate2}`,
          );
          say(
            event.cublas_dir
              ? `cuBLAS: ${event.cublas_dir}`
              : "cuBLAS: nicht im Suchpfad",
          );
        }
        if (event.type === "device") device = event;
        if (event.type === "warn") say(`Hinweis: ${event.message}`);
        if (event.type === "error") console.error(`Fehler: ${event.message}`);
      }
    });

    child.stderr.on("data", (chunk) => process.stderr.write(chunk));

    child.on("close", (code) => {
      say("");
      if (device?.device === "cuda") {
        say(
          `Grafikkarte nutzbar: ${device.gpu ?? "NVIDIA"}, ${device.compute_type}.`,
        );
        say("Empfohlenes Modell: large-v3-turbo.");
      } else if (device) {
        say(`Läuft auf der CPU (${device.compute_type}), Modell ${device.model}.`);
        if (device.fallback_reason) say(`Grund: ${device.fallback_reason}`);
        say(
          "Rechnen Sie mit etwa sechs bis zehn Minuten je Stunde Aufnahme.",
        );
      } else {
        say(`Der Probelauf ist fehlgeschlagen (Code ${code}).`);
      }
      say("\nFertig. Der Knopf „Transkribieren“ steht jetzt am Beitrag.");
      resolve(undefined);
    });
  });
}

void main();
