import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { paths } from "@/lib/paths";
import { readSettings } from "@/lib/settings";
import { quotePosix } from "@/lib/shell/quote";
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
 * Das Feature ist ein LÖSCHBARES PAAR: diese Datei und das Startskript
 * (`scripts/assistent-starten.ps1` unter Windows, `.sh` unter macOS). Wer
 * beides entfernt, verliert einen Knopf. Der eigentliche Weg bleibt der
 * Handbetrieb:
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
  const name =
    process.platform === "win32"
      ? "assistent-starten.ps1"
      : "assistent-starten.sh";
  return path.join(process.cwd(), "scripts", name);
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

  const lauf =
    process.platform === "darwin"
      ? await runMac(script, tool, prompt, settings.assistantArgs, checked)
      : process.platform === "win32"
        ? await runWindows(
            script,
            tool,
            prompt,
            settings.assistantArgs,
            checked,
          )
        : {
            ok: false as const,
            error:
              "Ein sichtbares Assistenten-Fenster gibt es nur unter Windows " +
              "und macOS. Der Handbetrieb steht unter Einstellungen.",
          };
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

function runWindows(
  script: string,
  tool: string,
  prompt: string,
  toolArgs: readonly string[],
  slug: string | null,
): Promise<ScriptRun> {
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
    ...(toolArgs.length > 0 ? ["-ToolArgs", ...toolArgs] : []),
    ...(slug ? ["-Slug", slug] : []),
  ];
  return waitForHelper("powershell.exe", args, "PowerShell");
}

/**
 * Unter macOS darf der Auftragstext NICHT in einen `osascript -e`-String.
 * AppleScript-Quotierung und Shell-Quotierung decken sich nicht — das wäre
 * eine Einladung zur Befehls-Injektion.
 *
 * Stattdessen schreibt Node eine temporäre Datei, deren Inhalt mit
 * `quotePosix` echte Shell-Wörter sind, und reicht osascript nur den PFAD
 * dieser Datei — der Pfad selbst stammt nicht aus dem Auftragstext.
 * Terminal.app führt die Datei aus; das Hüllskript öffnet das sichtbare
 * Fenster, analog zu Start-Process unter Windows.
 */
async function runMac(
  script: string,
  tool: string,
  prompt: string,
  toolArgs: readonly string[],
  slug: string | null,
): Promise<ScriptRun> {
  const tmp = path.join(
    os.tmpdir(),
    `mediathek-assistent-${process.pid}-${Date.now()}.sh`,
  );

  const teile = [
    quotePosix(script),
    "--library-dir",
    quotePosix(paths.library),
    "--tool",
    quotePosix(tool),
    "--prompt",
    quotePosix(prompt),
  ];
  if (slug) teile.push("--slug", quotePosix(slug));
  if (toolArgs.length > 0) {
    teile.push("--tool-args", ...toolArgs.map(quotePosix));
  }

  const inhalt = [
    "#!/bin/bash",
    "set -euo pipefail",
    `trap 'rm -f -- ${quotePosix(tmp)}' EXIT`,
    teile.join(" "),
    "",
  ].join("\n");

  await fs.writeFile(tmp, inhalt, { encoding: "utf8", mode: 0o700 });

  const applescript = [
    "on run argv",
    '  tell application "Terminal"',
    "    activate",
    '    do script ("exec " & quoted form of (item 1 of argv))',
    "  end tell",
    "end run",
  ].join("\n");

  return waitForHelper("osascript", ["-", tmp], "osascript", applescript);
}

/**
 * Das Hüllskript ausführen und auf sein Ende WARTEN.
 *
 * Vorher stand hier ein spawn mit stdio "ignore" und unref(), und die
 * Funktion meldete Erfolg, sobald spawn nicht sofort geworfen hatte. Alles
 * danach war unsichtbar: ein falscher Pfad, eine abgelehnte
 * Ausführungsrichtlinie, ein unerreichbarer Ordner. Der Knopf sagte "Ein
 * Fenster ist offen", und es passierte nichts.
 *
 * Das Warten kostet nichts: das Skript ruft Start-Process (Windows) bzw.
 * osascript (macOS) und ist fertig. Das eigentliche Fenster lebt unabhängig
 * weiter.
 */
function waitForHelper(
  command: string,
  args: readonly string[],
  label: string,
  stdinText?: string,
): Promise<ScriptRun> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: ScriptRun) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, [...args], {
        // Kein shell: true. Die Argumente gehen einzeln, nie als eine Zeile.
        shell: false,
        // stdout und stderr werden GELESEN — sonst ist jeder Fehler unsichtbar.
        stdio: [stdinText ? "pipe" : "ignore", "pipe", "pipe"],
        /*
         * Dieser Aufruf bleibt verborgen, sonst blitzte bei jedem Klick eine
         * leere Konsole auf. Das sichtbare Fenster öffnet das Skript selbst.
         */
        windowsHide: true,
      });
    } catch (error) {
      finish({
        ok: false,
        error: `${label} ließ sich nicht starten: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return;
    }

    if (stdinText) {
      child.stdin?.write(stdinText);
      child.stdin?.end();
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
        error: `${label} ließ sich nicht starten: ${error.message}`,
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
