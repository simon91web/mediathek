/**
 * Erschließt einen Obsidian-Vault von außen.
 *
 *   node scripts/vault.mjs --vault D:\Wissen kapitel "Vorflugkontrolle Elios 3"
 *   node scripts/vault.mjs --vault D:\Wissen transkribieren "Vorflugkontrolle Elios 3"
 *   node scripts/vault.mjs --vault D:\Wissen --was bestand "Wie prüfe ich den Akku?"
 *
 * Arbeitsverzeichnis des Werkzeugs ist der Vault. Die Anleitungen liegen in
 * vorlagen/anleitungen/ und gehen als Text in den Auftrag. Das Protokoll
 * liegt maschinenlokal, nicht im Vault.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  MODEL_TASKS,
  TASK_LABEL,
  TASKS,
  artOf,
  assertBinary,
  assertInvocation,
  buildCliArgs,
  buildOrder,
  focusFrom,
  formatTranscript,
  glossaryTerms,
  hearingRules,
  replaceHearings,
  replaceHearingsInNote,
  upsertTranscript,
  knownBinary,
  mediaBeside,
  nextStatus,
  noteRelatives,
  parseVaultArgs,
  readToolset,
  sendsPromptOnStdin,
  spotsPresent,
} from "./vault-lib.mjs";

const REPO = path.join(import.meta.dirname, "..");
const ANLEITUNGEN = path.join(REPO, "vorlagen", "anleitungen");
const TOOLSET = path.join(REPO, "vorlagen", "toolset.yaml");
const TOOLS = path.join(REPO, "tools");

const USAGE = `Aufruf: node scripts/vault.mjs --vault <ordner> <aufgabe> [name]

Aufgaben:
${TASKS.map((task) => `  ${task.padEnd(18)} ${TASK_LABEL[task]}`).join("\n")}

  sichtung, kapitel, bezuege und transkribieren nehmen einen Namen.
  bestand nimmt die Frage, auch in mehreren Wörtern.
  wortlaut liest hoerfehler aus dem Glossar. --anwenden schreibt die Ersetzungen.

Optionen:
  --werkzeug grok|claude|custom    Standard grok
  --bin <programm>                 Pfad, falls er nicht im Suchpfad liegt
  --args "<argumente>"             zusätzliche Argumente des Werkzeugs
  --timeout <sekunden>             Standard 900
  --was                            Auftrag zeigen, nichts starten
  --anwenden                       bei wortlaut die Treffer ersetzen
`;

function dataDir() {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA ?? os.homedir(), "Mediathek");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Mediathek");
  }
  const base = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(base, "Mediathek");
}

function stamp(when = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
}

function logFile() {
  return path.join(dataDir(), "vault-laeufe.log");
}

function appendLog(text) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.appendFileSync(logFile(), text, "utf8");
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: false, windowsHide: true });
    return;
  }
  try {
    process.kill(pid);
  } catch {
    // Der Lauf ist schon zu Ende.
  }
}

function resolveBinary(preset, bin) {
  if (bin.trim()) {
    assertBinary(bin);
    return bin.trim();
  }
  for (const candidate of knownBinary(preset, os.homedir())) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return preset;
}

function existingFile(vault, relatives) {
  for (const rel of relatives) {
    const abs = path.join(vault, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return null;
}

function requireVaultFile(vault, folders, task, name) {
  const relatives = noteRelatives(folders, task, name);
  const found = existingFile(vault, relatives);
  if (found) return found;
  throw new Error(`${relatives[0]} fehlt im Vault.`);
}

function loadOrderParts() {
  const texts = {};
  for (const task of MODEL_TASKS) {
    texts[task] = fs.readFileSync(path.join(ANLEITUNGEN, `%_${task}.md`), "utf8");
  }
  return { texts, regeln: fs.readFileSync(path.join(ANLEITUNGEN, "%_REGELN.md"), "utf8") };
}

function titleOf(task, rest) {
  const label = TASK_LABEL[task];
  const named = task === "kapitel" || task === "bezuege" || task === "transkribieren" || task === "sichtung";
  return named && rest[0] ? `${label} · ${rest[0]}` : label;
}

function locateFfmpeg() {
  const exe = (name) => (process.platform === "win32" ? `${name}.exe` : name);
  const dirs = [process.env.MEDIATHEK_FFMPEG_DIR, path.join(REPO, "ffmpeg", "bin")].filter(Boolean);
  for (const dir of dirs) {
    const ffprobe = path.join(dir, exe("ffprobe"));
    if (fs.existsSync(ffprobe)) return { ffmpeg: path.join(dir, exe("ffmpeg")), ffprobe, dir };
  }
  if (spawnSync(exe("ffprobe"), ["-version"], { stdio: "ignore", windowsHide: true }).status === 0) {
    return { ffmpeg: exe("ffmpeg"), ffprobe: exe("ffprobe"), dir: null };
  }
  return null;
}

function venvPython() {
  return process.platform === "win32"
    ? path.join(TOOLS, ".venv", "Scripts", "python.exe")
    : path.join(TOOLS, ".venv", "bin", "python");
}

/**
 * Startet einen Prozess ohne Shell. stdinText geht nur an Claude, der den
 * Auftrag von der Standardeingabe liest. cancel beendet den Prozessbaum.
 */
function startChild({ command, args, cwd, env, stdinText, timeoutSec, write, onStdout }) {
  const child = spawn(command, args, {
    cwd,
    env,
    shell: false,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let settled = false;
  const done = new Promise((resolve) => {
    const timer = setTimeout(() => {
      write(`\nZeitlimit nach ${timeoutSec} Sekunden.\n`);
      if (child.pid) killTree(child.pid);
    }, timeoutSec * 1000);
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code);
    };
    child.on("error", (error) => {
      write(`\nWerkzeug nicht startbar (${command}): ${error.message}\n`);
      finish(1);
    });
    child.stdout?.on("data", (chunk) => (onStdout ?? write)(chunk.toString()));
    child.stderr?.on("data", (chunk) => write(chunk.toString()));
    child.on("close", (code) => finish(code ?? 1));
    if (stdinText) child.stdin.write(stdinText);
    child.stdin.end();
  });
  return {
    done,
    cancel: () => {
      if (child.pid) killTree(child.pid);
    },
  };
}

function runLogged(title, timeoutSec, open) {
  appendLog(`\n${stamp()} · ${title}\n`);
  console.log(title);
  let cancel = () => {};
  let cancelled = false;
  const onSigint = () => {
    cancelled = true;
    cancel();
  };
  process.on("SIGINT", onSigint);
  const handle = open((chunk) => {
    process.stdout.write(chunk);
    appendLog(chunk);
  });
  cancel = handle.cancel;
  return handle.done
    .then((code) => {
      const end = cancelled ? "abgebrochen" : `Code ${code}`;
      appendLog(`Ende · ${end}\n`);
      console.log(`Ende · ${end}`);
      console.log(logFile());
      return cancelled ? 1 : code;
    })
    .finally(() => process.off("SIGINT", onSigint));
}

async function runModel(parsed, vault, prompt) {
  const binary = resolveBinary(parsed.werkzeug, parsed.bin);
  assertBinary(binary);
  const settings = { cliPreset: parsed.werkzeug, cliBinary: parsed.bin, cliExtraArgs: parsed.extraArgs };
  if (parsed.dryRun) {
    const preview = buildCliArgs(settings, "<auftrag.txt>");
    console.log(`${binary} ${preview.join(" ")}`);
    console.log(`Arbeitsverzeichnis: ${vault}`);
    console.log("");
    console.log(prompt);
    return 0;
  }
  const promptFile = path.join(
    os.tmpdir(),
    `mediathek-vault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`,
  );
  fs.writeFileSync(promptFile, prompt, "utf8");
  const args = buildCliArgs(settings, promptFile);
  try {
    return await runLogged(titleOf(parsed.task, parsed.rest), parsed.timeoutSec, (write) =>
      startChild({
        command: binary,
        args,
        cwd: vault,
        env: process.env,
        stdinText: sendsPromptOnStdin(parsed.werkzeug) ? prompt : "",
        timeoutSec: parsed.timeoutSec,
        write,
      }),
    );
  } finally {
    fs.rmSync(promptFile, { force: true });
  }
}

function hotwordsFor(folders, vault, noteBase) {
  const dir = path.join(vault, folders.ordner.glossar);
  const texts = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".md")) texts.push(fs.readFileSync(path.join(dir, name), "utf8"));
    }
  }
  return [...new Set([noteBase, ...glossaryTerms(texts)])];
}

function mediaFor(vault, folders, noteFile, noteBase) {
  const attachDir = path.join(vault, folders.ordner.anhaenge);
  const attachNames = fs.existsSync(attachDir) ? fs.readdirSync(attachDir) : [];
  const beside = mediaBeside(noteBase, attachNames);
  if (beside) return path.join(attachDir, beside);
  const noteDir = path.dirname(noteFile);
  const local = mediaBeside(noteBase, fs.readdirSync(noteDir));
  return local ? path.join(noteDir, local) : null;
}

function writeTranscript(noteFile, jsonPath) {
  const raw = fs.readFileSync(jsonPath, "utf8");
  const parsed = JSON.parse(raw);
  const body = formatTranscript(parsed.segments ?? []);
  if (!body) return;
  const original = fs.readFileSync(noteFile, "utf8");
  let next = upsertTranscript(original, body);
  if (original.includes("\r\n")) next = next.replace(/\r?\n/g, "\r\n");
  if (next !== original) fs.writeFileSync(noteFile, next, "utf8");
}

function parseWhisperLines(write) {
  let buffer = "";
  const state = { errorCode: null, message: "" };
  const take = (line) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      if (event.type === "error") {
        state.errorCode = event.code ?? "internal";
        state.message = event.message ?? line;
        write(`\n${state.message}\n`);
      } else if (event.type === "device") {
        write(event.device === "cuda" ? "Läuft auf der Grafikkarte.\n" : "Läuft auf der CPU.\n");
      } else if (event.message) {
        write(`${event.message}\n`);
      }
    } catch {
      write(`${line}\n`);
    }
  };
  return {
    state,
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) take(line);
    },
    flush() {
      if (buffer.trim()) take(buffer);
      buffer = "";
    },
  };
}

function whisperOnce({ python, script, args, cublasDir, ffmpegDir, timeoutSec, write }) {
  const env = { ...process.env, PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" };
  const parts = [cublasDir, ffmpegDir, env.PATH].filter(Boolean);
  env.PATH = parts.join(path.delimiter);
  const lines = parseWhisperLines(write);
  const handle = startChild({
    command: python,
    args: [script, ...args],
    cwd: TOOLS,
    env,
    stdinText: "",
    timeoutSec,
    write,
    onStdout: (chunk) => lines.push(chunk),
  });
  const done = handle.done.then((code) => {
    lines.flush();
    return { code, errorCode: lines.state.errorCode, message: lines.state.message };
  });
  return { done, cancel: handle.cancel };
}

async function runWhisper(parsed, vault, folders) {
  const { note } = focusFrom(parsed.task, parsed.rest);
  const noteFile = requireVaultFile(vault, folders, parsed.task, note);
  const noteBase = path.basename(noteFile, ".md");
  const mediaPath = mediaFor(vault, folders, noteFile, noteBase);
  if (!mediaPath) {
    throw new Error(`In ${folders.ordner.anhaenge} liegt keine Video- oder Audiodatei mit dem Namen ${noteBase}.`);
  }
  const python = venvPython();
  const script = path.join(TOOLS, "transcribe.py");
  if (!fs.existsSync(python) || !fs.existsSync(script)) {
    throw new Error("Python-Umgebung fehlt. Einmalig im Mediathek-Repo: npm run setup:python");
  }
  const ffmpeg = locateFfmpeg();
  if (!ffmpeg) {
    throw new Error("ffmpeg wurde nicht gefunden. MEDIATHEK_FFMPEG_DIR auf den Ordner mit ffmpeg und ffprobe setzen.");
  }
  const hotwords = hotwordsFor(folders, vault, noteBase);
  if (parsed.dryRun) {
    console.log(noteFile);
    console.log(mediaPath);
    console.log(hotwords.join(", "));
    console.log(python);
    return 0;
  }

  const cublas = path.join(TOOLS, ".venv", "Lib", "site-packages", "nvidia", "cublas", "bin");
  const cublasDir = fs.existsSync(path.join(cublas, "cublas64_12.dll")) ? cublas : null;
  const work = path.join(dataDir(), "whisper-work", String(Date.now()));
  fs.mkdirSync(work, { recursive: true });
  let hotwordsFile = null;
  if (hotwords.length > 0) {
    hotwordsFile = path.join(work, "glossar.txt");
    fs.writeFileSync(hotwordsFile, hotwords.join(", "), "utf8");
  }
  const argsFor = (device) => [
    "--media",
    mediaPath,
    "--out-dir",
    work,
    "--work-dir",
    work,
    "--job-id",
    path.basename(work),
    "--model",
    "large-v3-turbo",
    "--device",
    device,
    "--language",
    "de",
    "--no-segment-events",
    "--ffmpeg",
    ffmpeg.ffmpeg,
    "--ffprobe",
    ffmpeg.ffprobe,
    ...(hotwordsFile ? ["--hotwords-file", hotwordsFile] : []),
  ];

  return runLogged(titleOf(parsed.task, parsed.rest), parsed.timeoutSec, (write) => {
    let active = null;
    const launch = (device) => {
      active = whisperOnce({
        python,
        script,
        args: argsFor(device),
        cublasDir,
        ffmpegDir: ffmpeg.dir,
        timeoutSec: parsed.timeoutSec,
        write,
      });
      return active;
    };
    const done = (async () => {
      write("Python wird geprüft.\n");
      let result = await launch("auto").done;
      if (result.code !== 0 && (result.errorCode === "gpu_lost" || result.errorCode === "out_of_memory")) {
        write("\nDie Grafikkarte hat abgebrochen. Neuer Versuch auf der CPU.\n");
        result = await launch("cpu").done;
      }
      if (result.code === 0) {
        const produced = path.join(work, "transcript.json");
        const target = path.join(path.dirname(noteFile), `${noteBase}.transcript.json`);
        fs.copyFileSync(produced, target);
        const vtt = path.join(work, "transcript.vtt");
        if (fs.existsSync(vtt)) {
          fs.copyFileSync(vtt, path.join(path.dirname(noteFile), `${noteBase}.transcript.vtt`));
        }
        writeTranscript(noteFile, target);
        fs.rmSync(work, { recursive: true, force: true });
      } else {
        write(`\nArbeitsordner bleibt liegen: ${work}\n`);
      }
      return result.code;
    })().catch((error) => {
      write(`\n${error.message}\n`);
      return 1;
    });
    return { done, cancel: () => active?.cancel() };
  });
}

function refreshHinweise(vault, folders) {
  let changed = 0;
  const notizen = path.join(vault, folders.ordner.notizen);
  if (fs.existsSync(notizen)) {
    for (const name of fs.readdirSync(notizen)) {
      if (!name.endsWith(".md")) continue;
      const file = path.join(notizen, name);
      const text = fs.readFileSync(file, "utf8");
      const base = name.slice(0, -3);
      const next = nextStatus(text, {
        art: artOf(text),
        hasTranscript: fs.existsSync(path.join(notizen, `${base}.transcript.json`)),
        hasChapters: /^### \d{1,3}:\d{2}/m.test(text),
        hasSpots: false,
      });
      if (next) {
        fs.writeFileSync(file, next, "utf8");
        changed += 1;
      }
    }
  }
  const karten = path.join(vault, folders.ordner.karten);
  if (fs.existsSync(karten)) {
    for (const name of fs.readdirSync(karten)) {
      if (!name.endsWith(".md")) continue;
      const file = path.join(karten, name);
      const text = fs.readFileSync(file, "utf8");
      const next = nextStatus(text, {
        art: "Karte",
        hasTranscript: false,
        hasChapters: false,
        hasSpots: spotsPresent(text),
      });
      if (next) {
        fs.writeFileSync(file, next, "utf8");
        changed += 1;
      }
    }
  }
  if (changed > 0) console.log(`${changed} Dateien mit Status nach dem Bestand.`);
}

function markdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(dir, name));
}

function runWortlaut(vault, folders, write) {
  const glossarDir = path.join(vault, folders.ordner.glossar);
  const rules = hearingRules(markdownFiles(glossarDir).map((file) => fs.readFileSync(file, "utf8")));
  if (rules.length === 0) {
    console.log("Im Glossar steht kein hoerfehler. Die falsche Form gehört an den Begriff.");
    return;
  }
  const jobs = [];
  const noteDir = path.join(vault, folders.ordner.notizen);
  for (const file of markdownFiles(noteDir)) jobs.push({ file, kind: "prosa" });
  if (fs.existsSync(noteDir)) {
    for (const name of fs.readdirSync(noteDir)) {
      if (name.endsWith(".transcript.json")) jobs.push({ file: path.join(noteDir, name), kind: "transkript" });
    }
  }
  for (const key of ["karten", "glossar", "fragen"]) {
    for (const file of markdownFiles(path.join(vault, folders.ordner[key]))) jobs.push({ file, kind: "prosa" });
  }
  for (const file of markdownFiles(path.join(vault, folders.ordner.analysen))) jobs.push({ file, kind: "befund" });

  const lines = [];
  let written = 0;
  for (const job of jobs) {
    const original = fs.readFileSync(job.file, "utf8");
    const result = job.file.endsWith(".md")
      ? replaceHearingsInNote(original, rules)
      : replaceHearings(original, rules, { json: true });
    if (result.hits.length === 0) continue;
    const rel = path.relative(vault, job.file);
    for (const hit of result.hits) {
      const action = job.kind === "befund" ? "nur anzeigen" : write ? "ersetzt" : "offen";
      lines.push(`${hit.begriff}\t${hit.wrong}\t${action}\t${rel}\t${hit.snippet}`);
    }
    if (write && job.kind !== "befund" && result.text !== original) {
      fs.writeFileSync(job.file, result.text);
      written += 1;
    }
  }
  if (lines.length === 0) {
    console.log("Keine Hörfehler im Bestand.");
    return;
  }
  let current = "";
  for (const line of lines) {
    const [begriff, wrong, action, rel, snippet] = line.split("\t");
    const head = `${begriff}  statt  ${wrong}`;
    if (head !== current) {
      console.log(head);
      current = head;
    }
    console.log(`  ${rel}  (${action})  ${snippet}`);
  }
  console.log(
    write
      ? `${written} Dateien geschrieben. Befunde unter Analysen bleiben stehen.`
      : "Nichts geschrieben. --anwenden ersetzt Transkript und Prosa. Befunde bleiben stehen.",
  );
}

async function main() {
  let parsed;
  try {
    parsed = parseVaultArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  if (parsed.help || process.argv.length <= 2) {
    console.log(USAGE);
    process.exit(parsed.help ? 0 : 1);
  }
  try {
    assertInvocation(parsed);
    const vault = path.resolve(parsed.vault);
    if (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory()) {
      throw new Error(`Vault nicht gefunden: ${vault}`);
    }
    const folders = readToolset(fs.readFileSync(TOOLSET, "utf8"));
    if (parsed.task === "transkribieren") {
      const code = await runWhisper(parsed, vault, folders);
      process.exit(code);
    }
    if (parsed.task === "wortlaut") {
      runWortlaut(vault, folders, parsed.anwenden && !parsed.dryRun);
      process.exit(0);
    }
    const { note, question } = focusFrom(parsed.task, parsed.rest);
    if (note) requireVaultFile(vault, folders, parsed.task, note);
    const { texts, regeln } = loadOrderParts();
    const prompt = buildOrder({ task: parsed.task, note, question, regeln, texts });
    const code = await runModel(parsed, vault, prompt);
    if (code === 0 && parsed.task === "vollstaendigkeit" && !parsed.dryRun) refreshHinweise(vault, folders);
    process.exit(code);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

void main();
