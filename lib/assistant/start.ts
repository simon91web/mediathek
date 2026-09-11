import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { paths } from "@/lib/paths";
import { readSettings } from "@/lib/settings";
import { checkAssistantTask, noteAssistantRun } from "./preflight";
import { buildPrompt } from "./tasks";

/*
 * Die Brücke zu einem KI-Kommandozeilenwerkzeug.
 *
 * Kapitel, Zusammenfassungen, Bezüge und Themenseiten erzeugt die Mediathek
 * nicht selbst. Dieses Modul öffnet dafür ein sichtbares Fenster im
 * Bibliotheksordner.
 *
 * WERKZEUGUNABHÄNGIG, und das ist eine bewusste Festlegung:
 *
 * - Übergeben wird ein **gewöhnlicher Auftragstext**, kein Slash-Befehl.
 *   `/kapitel` versteht nur Claude Code — es liest dafür `.claude/commands/`.
 *   Der Text hier nennt stattdessen die Anleitung, die zu befolgen ist, und
 *   lesen kann die jedes Werkzeug, das Dateien im Arbeitsverzeichnis öffnet.
 * - Die **Anleitungen liegen in der Bibliothek** unter `anleitungen/` und
 *   beschreiben nur Dateien und Formate. Kein Programm wird vorausgesetzt.
 * - Das **Programm steht in den Einstellungen** (`assistantCommand`).
 *   Voreingestellt ist `claude`, weil es hier nachweislich läuft — erprobt
 *   ist nur dieses.
 *
 * Das Feature ist ein LÖSCHBARES PAAR: diese Datei und
 * scripts/assistent-starten.ps1. Wer beides entfernt, verliert einen Knopf.
 * Der eigentliche Weg bleibt der Handbetrieb:
 *
 *     cd S:\Mediathek
 *     claude
 *     Befolge die Anweisungen in anleitungen/kapitel.md …
 *
 * Ein Knopf, der einen Prozess startet, ist die gefährlichste Stelle der
 * Anwendung. Deshalb vier Riegel, jeder für sich ausreichend:
 *
 *   1. Autorenmodus. Im weitergegebenen Viewer nicht einschaltbar.
 *   2. Server Action. Next prüft dabei Origin gegen Host.
 *   3. Positivlisten. Die Aufgabe gegen ASSISTANT_TASKS, der Slug gegen
 *      SLUG_PATTERN, gegen den Index UND gegen das Dateisystem, das Programm
 *      gegen eine enge Grammatik ohne Pfad und ohne Leerzeichen.
 *   4. Eine Sperre von zehn Sekunden.
 *
 * Freitext geht NIE auf eine Kommandozeile — die Anleitungen sind Dateien.
 */

export {
  ASSISTANT_TASKS,
  ASSISTANT_TASK_LABEL,
  buildPrompt,
  INSTRUCTIONS_DIR,
  needsSlug,
} from "./tasks";
export type { AssistantTask } from "./tasks";

/** Höchstens ein Fenster in zehn Sekunden. */
const MIN_INTERVAL_MS = 10_000;

/** So lange darf das Hüllskript brauchen. Es ruft nur Start-Process. */
const SCRIPT_TIMEOUT_MS = 20_000;

const globalForAssistant = globalThis as unknown as {
  mediathekAssistantLastLaunchAt?: number;
};

export type LaunchResult =
  { ok: true; prompt: string; tool: string } | { ok: false; error: string };

function scriptPath(): string {
  return path.join(process.cwd(), "scripts", "assistent-starten.ps1");
}

export async function launchAssistant(
  task: unknown,
  slug?: unknown,
): Promise<LaunchResult> {
  const vorpruefung = await checkAssistantTask(task, slug);
  if (!vorpruefung.ok) return vorpruefung;
  const { task: geprueft, slug: checked, tool } = vorpruefung;

  const settings = await readSettings();

  const script = scriptPath();
  try {
    await fs.access(script);
  } catch {
    return { ok: false, error: `Das Startskript fehlt: ${script}` };
  }

  const now = Date.now();
  const last = globalForAssistant.mediathekAssistantLastLaunchAt ?? 0;
  if (now - last < MIN_INTERVAL_MS) {
    const wait = Math.ceil((MIN_INTERVAL_MS - (now - last)) / 1000);
    return {
      ok: false,
      error: `Gerade wurde schon ein Fenster geöffnet — noch ${wait} s warten.`,
    };
  }
  globalForAssistant.mediathekAssistantLastLaunchAt = now;

  const prompt = buildPrompt(geprueft, checked);

  const args = [
    "-NoProfile",
    /*
     * Bypass, weil das Skript unsigniert ist. Kommt der Anwendungsordner von
     * einer Freigabe, gilt er als "remote", und RemoteSigned würde ihn
     * ablehnen. Ausgeführt wird eine Datei aus dem eigenen Programmordner.
     */
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    "-LibraryDir",
    paths.library,
    "-Tool",
    tool,
    "-Prompt",
    prompt,
    ...(settings.assistantArgs.length > 0
      ? ["-ToolArgs", ...settings.assistantArgs]
      : []),
    ...(checked ? ["-Slug", checked] : []),
  ];

  const lauf = await runScript(args);
  if (!lauf.ok) {
    await noteAssistantRun(`FEHLGESCHLAGEN ${tool}: ${prompt} — ${lauf.error}`);
    return { ok: false, error: lauf.error };
  }

  await noteAssistantRun(
    `${tool}: ${prompt}  (${paths.library})  ${lauf.output}`.trim(),
  );
  return { ok: true, prompt, tool };
}

type ScriptRun = { ok: true; output: string } | { ok: false; error: string };

/**
 * Das Hüllskript ausführen und auf sein Ende WARTEN.
 *
 * Vorher stand hier ein spawn mit stdio "ignore" und unref(), und die
 * Funktion meldete Erfolg, sobald spawn nicht sofort geworfen hatte. Alles
 * danach war unsichtbar: ein falscher Pfad, eine abgelehnte
 * Ausführungsrichtlinie, ein unerreichbarer Ordner. Der Knopf sagte "Ein
 * Fenster ist offen", und es passierte nichts.
 *
 * Das Warten kostet nichts: das Skript ruft Start-Process und ist fertig.
 * Das eigentliche Fenster lebt unabhängig weiter.
 */
function runScript(args: readonly string[]): Promise<ScriptRun> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: ScriptRun) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("powershell.exe", [...args], {
        // Kein shell: true. Die Argumente gehen einzeln, nie als eine Zeile.
        shell: false,
        // stdout und stderr werden GELESEN — sonst ist jeder Fehler unsichtbar.
        stdio: ["ignore", "pipe", "pipe"],
        /*
         * Dieser Aufruf bleibt verborgen, sonst blitzte bei jedem Klick eine
         * leere Konsole auf. Das sichtbare Fenster öffnet das Skript selbst
         * per Start-Process mit -WindowStyle Normal.
         */
        windowsHide: true,
      });
    } catch (error) {
      finish({
        ok: false,
        error: `PowerShell ließ sich nicht starten: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return;
    }

    let out = "";
    let err = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        error:
          "Das Startskript hat nicht geantwortet. Der Handbetrieb steht " +
          "unter Einstellungen.",
      });
    }, SCRIPT_TIMEOUT_MS);
    timer.unref?.();

    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        error: `PowerShell ließ sich nicht starten: ${error.message}`,
      });
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        finish({ ok: true, output: out.trim() });
        return;
      }
      // Die Meldung des Skripts durchreichen, nicht "Fehler 1".
      const meldung = (err.trim() || out.trim()).split("\n")[0] ?? "";
      finish({
        ok: false,
        error:
          `Das Startskript endete mit Fehler ${code}` +
          (meldung ? `: ${meldung}` : "."),
      });
    });
  });
}
