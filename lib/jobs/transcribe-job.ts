import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { getItem, reloadLibrary } from "@/lib/library";
import { markOwnWrite } from "@/lib/library/store";
import { invalidateTranscripts } from "@/lib/library/transcript";
import { locateFfmpeg } from "@/lib/media/locate";
import { paths } from "@/lib/paths";
import { readSettings } from "@/lib/settings";
import { JobError } from "./queue";
import type { JobContext } from "./queue";
import { childEnv, findPythonEnv } from "./python";
import type { JobErrorCode } from "./types";

/*
 * Der Transkriptionslauf: startet tools/transcribe.py und übersetzt dessen
 * JSON-Lines in Fortschritt für die Oberfläche.
 *
 * Video und Sprachmemo laufen durch denselben Pfad — die ffmpeg-Vorstufe im
 * Skript liest beide gleich.
 */

type Event = {
  type: string;
  [key: string]: unknown;
};

const KNOWN_CODES = new Set<JobErrorCode>([
  "ffmpeg_missing",
  "ffmpeg_failed",
  "no_audio_stream",
  "python_missing",
  "model_download_failed",
  "gpu_unavailable",
  "gpu_lost",
  "out_of_memory",
  "canceled",
  "internal",
]);

function toErrorCode(raw: unknown): JobErrorCode {
  return typeof raw === "string" && KNOWN_CODES.has(raw as JobErrorCode)
    ? (raw as JobErrorCode)
    : "internal";
}

/**
 * Die Fachbegriffe für diesen Beitrag: Titel, Schlagworte und das
 * bibliotheksweite Glossar.
 *
 * Das ist der billigste Genauigkeitsgewinn bei Fachvorträgen. Ohne das
 * schreibt Whisper Fachwörter phonetisch falsch — nachgemessen "Eliös 3"
 * statt "Elios 3" — und die daraus erzeugten Kapitel erben den Fehler.
 *
 * Übergeben wird das als DATEI, nie als Argument: so gerät kein Freitext auf
 * eine Kommandozeile.
 */
async function buildHotwords(
  slug: string,
  workDir: string,
): Promise<string | null> {
  const item = await getItem(slug);
  const parts: string[] = [];
  if (item?.title) parts.push(item.title);
  if (item?.tags.length) parts.push(...item.tags);

  try {
    const glossary = await fs.readFile(paths.glossary, "utf8");
    for (const line of glossary.split("\n")) {
      const term = line.trim();
      if (term && !term.startsWith("#")) parts.push(term);
    }
  } catch {
    // Kein Glossar: dann eben nur Titel und Schlagworte.
  }

  const unique = [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) return null;

  const file = path.join(workDir, "glossar.txt");
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(file, unique.join(", "), "utf8");
  return file;
}

export async function runTranscribeJob(context: JobContext): Promise<void> {
  const { job, update, log } = context;

  const item = await getItem(job.slug);
  if (!item) {
    throw new JobError("internal", `Den Beitrag "${job.slug}" gibt es nicht.`);
  }
  if (!item.assets.mediaFile) {
    throw new JobError(
      "no_audio_stream",
      "Zu diesem Beitrag gibt es keine Mediendatei.",
    );
  }

  const python = await findPythonEnv();
  if (!python) {
    throw new JobError(
      "python_missing",
      "Die Python-Umgebung für die Transkription fehlt. Einzurichten unter " +
        "Einstellungen → Verarbeitung.",
    );
  }

  const tools = await locateFfmpeg();
  if (!tools) {
    throw new JobError(
      "ffmpeg_missing",
      "ffmpeg wurde nicht gefunden — es liest die Tonspur. Den Ordner mit " +
        "ffmpeg.exe und ffprobe.exe unter Einstellungen eintragen.",
    );
  }

  const settings = await readSettings();
  const stateDir = path.dirname(job.logFile ?? "");
  const workDir = path.join(path.dirname(stateDir), "work", job.id);
  await fs.mkdir(workDir, { recursive: true });

  const hotwordsFile = await buildHotwords(job.slug, workDir);

  // Ein Wiederholungsversuch auf der CPU, falls die Karte mitten im Lauf
  // aufgibt. Mehr nicht — sonst dreht sich das im Kreis.
  let device: "auto" | "cpu" = "auto";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    update({ attempt });
    const outcome = await runOnce({
      context,
      python,
      tools,
      mediaFile: item.assets.mediaFile,
      outDir: item.assets.dir,
      workDir,
      hotwordsFile,
      device,
      model: settings.whisperModel,
      language: settings.whisperLanguage,
    });

    if (outcome.ok) {
      markOwnWrite(path.join(item.assets.dir, "transcript.json"));
      markOwnWrite(path.join(item.assets.dir, "transcript.vtt"));
      invalidateTranscripts([job.slug]);
      await reloadLibrary({ onlySlugs: [job.slug] });
      update({
        stage: "write",
        progress: 1,
        message:
          `${outcome.segments} Abschnitte, ` +
          `${outcome.device === "cuda" ? "auf der Grafikkarte" : "auf der CPU"} ` +
          `in ${Math.round(outcome.wallSec)} s.`,
        deviceUsed: outcome.device,
      });
      // Aufräumen; die WAV im Arbeitsverzeichnis ist nicht mehr nötig.
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      return;
    }

    const retryOnCpu =
      attempt === 1 &&
      device === "auto" &&
      (outcome.code === "gpu_lost" || outcome.code === "out_of_memory");

    if (!retryOnCpu) {
      throw new JobError(outcome.code, outcome.message, outcome.detail);
    }

    log(`Neuer Versuch auf der CPU: ${outcome.message}`);
    update({
      message: "Die Grafikkarte hat abgebrochen — neuer Versuch auf der CPU.",
      progress: 0,
      fallbackReason: outcome.message,
    });
    device = "cpu";
  }

  throw new JobError(
    "internal",
    "Auch der Versuch auf der CPU ist gescheitert.",
  );
}

export type RunOutcome =
  | { ok: true; segments: number; device: "cuda" | "cpu"; wallSec: number }
  | { ok: false; code: JobErrorCode; message: string; detail?: string };

/**
 * Der eigentliche Whisper-Lauf, losgelöst von einem Beitrag: `mediaFile`,
 * `outDir` und `workDir` sind einfache Pfade. `runTranscribeJob` ruft das für
 * einen echten Beitrag auf; die Sichtung (`lib/screening/runner.ts`) für eine
 * noch nicht importierte Datei — beide teilen sich denselben Prozessstart und
 * dieselbe JSON-Lines-Auswertung, statt sie zweimal zu pflegen.
 */
export async function runOnce(input: {
  context: JobContext;
  python: Awaited<ReturnType<typeof findPythonEnv>> & object;
  tools: NonNullable<Awaited<ReturnType<typeof locateFfmpeg>>>;
  mediaFile: string;
  outDir: string;
  workDir: string;
  hotwordsFile: string | null;
  device: "auto" | "cpu";
  model: string;
  language: string;
}): Promise<RunOutcome> {
  const { context, python, tools } = input;
  const { update, log, setPid } = context;

  const args = [
    python.script,
    "--media",
    input.mediaFile,
    "--out-dir",
    input.outDir,
    "--work-dir",
    input.workDir,
    "--job-id",
    context.job.id,
    "--model",
    input.model,
    "--device",
    input.device,
    "--language",
    input.language,
    "--ffmpeg",
    tools.ffmpeg,
    "--ffprobe",
    tools.ffprobe,
    // Einzelne Segmente brauchen wir nicht laufend — das Transkript wird am
    // Ende in einem Stück geschrieben, und tausend Ereignisse je Lauf
    // wären nur Last.
    "--no-segment-events",
  ];
  if (input.hotwordsFile) {
    args.push("--hotwords-file", input.hotwordsFile);
  }

  log(`Start: ${python.exe} ${args.join(" ")}`);

  const child = spawn(python.exe, args, {
    cwd: python.toolsDir,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv(python, tools.dir),
  });
  setPid(child.pid ?? null);

  let segments = 0;
  let device: "cuda" | "cpu" = "cpu";
  let wallSec = 0;
  /*
   * Als Liste, nicht als einzelne Variable: TypeScript verengt eine mit null
   * initialisierte Variable auf null, wenn die Zuweisung nur in einem
   * Callback steht — beim Auslesen wäre sie dann "never". Ein Array umgeht
   * das ohne Typumgehung.
   */
  const failures: { code: JobErrorCode; message: string; detail?: string }[] =
    [];

  // stderr wörtlich ins Protokoll; die letzten Zeilen dienen der Fehleranzeige.
  const tail: string[] = [];
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      log(line.trimEnd());
      tail.push(line.trimEnd());
      if (tail.length > 40) tail.shift();
    }
  });

  const lines = readline.createInterface({
    input: child.stdout!,
    crlfDelay: Infinity,
  });

  lines.on("line", (line) => {
    if (!line.trim()) return;
    let event: Event;
    try {
      event = JSON.parse(line) as Event;
    } catch {
      // Eine Zeile, die kein JSON ist, gehört ins Protokoll — nicht in
      // einen Absturz.
      log(`stdout: ${line}`);
      return;
    }

    switch (event.type) {
      case "hello":
        log(
          `Python ${String(event.python)}, faster-whisper ` +
            `${String(event.faster_whisper)}, ctranslate2 ${String(event.ctranslate2)}`,
        );
        break;

      case "device": {
        device = event.device === "cuda" ? "cuda" : "cpu";
        const gpu = typeof event.gpu === "string" ? event.gpu : null;
        update({
          deviceUsed: device,
          fallbackReason:
            typeof event.fallback_reason === "string"
              ? event.fallback_reason
              : null,
          message:
            device === "cuda"
              ? `Läuft auf ${gpu ?? "der Grafikkarte"} (${String(event.compute_type)}).`
              : `Läuft auf der CPU, Modell ${String(event.model)}.`,
        });
        break;
      }

      case "stage":
        update({
          stage: String(event.stage),
          message: String(event.message ?? ""),
        });
        break;

      case "media":
        log(
          `Dauer ${String(event.duration_sec)} s, Ton ${String(event.audio_codec)}`,
        );
        break;

      case "progress": {
        const ratio = Number(event.ratio);
        const stage = String(event.stage);
        // Die ffmpeg-Vorstufe ist ein kleiner Teil des Ganzen; sie soll den
        // Balken nicht auf 100 % treiben, bevor Whisper überhaupt beginnt.
        const overall = stage === "ffmpeg" ? ratio * 0.05 : 0.05 + ratio * 0.95;
        update({
          progress: Number.isFinite(overall) ? overall : 0,
          stage,
          etaSec:
            typeof event.eta_sec === "number"
              ? Math.round(event.eta_sec)
              : null,
          speed: typeof event.speed === "number" ? event.speed : null,
        });
        break;
      }

      case "warn":
        log(`Hinweis: ${String(event.message)}`);
        update({ message: String(event.message) });
        break;

      case "done":
        segments = Number(event.segments) || 0;
        wallSec = Number(event.wall_sec) || 0;
        if (event.device === "cuda" || event.device === "cpu") {
          device = event.device;
        }
        break;

      case "error":
        failures.push({
          code: toErrorCode(event.code),
          message: String(event.message ?? "Fehlgeschlagen."),
          detail: typeof event.detail === "string" ? event.detail : undefined,
        });
        break;

      default:
        break;
    }
  });

  const code = await new Promise<number>((resolve) => {
    child.on("error", (error) => {
      failures.push({
        code: "internal",
        message: `Der Kindprozess ließ sich nicht starten: ${error.message}`,
      });
      resolve(-1);
    });
    child.on("close", (exitCode) => resolve(exitCode ?? -1));
  });

  lines.close();
  setPid(null);

  if (context.isCanceled()) {
    return { ok: false, code: "canceled", message: "Abgebrochen." };
  }
  const failure = failures[0];
  if (failure) return { ok: false, ...failure };
  if (code !== 0) {
    return {
      ok: false,
      code: "internal",
      message: `Die Transkription endete mit Code ${code}.`,
      detail: tail.slice(-10).join("\n"),
    };
  }
  if (segments === 0) {
    return {
      ok: false,
      code: "internal",
      message: "Es wurde kein Text erkannt.",
      detail: tail.slice(-10).join("\n"),
    };
  }

  return { ok: true, segments, device, wallSec };
}
