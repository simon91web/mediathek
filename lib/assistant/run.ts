import "server-only";

import { spawn } from "node:child_process";

import { paths } from "@/lib/paths";
import { readSettings } from "@/lib/settings";
import { checkAssistantTask, noteAssistantRun } from "./preflight";
import { buildPrompt } from "./tasks";
import type { AssistantTask } from "./tasks";

/*
 * Ein KI-Auftrag OHNE Fenster — für die Kette.
 *
 * Das ist die eine Stelle, an der diese Anwendung von einem ihrer Grundsätze
 * abweicht, und das soll hier stehen, nicht in einem Commit:
 *
 * Bisher galt: **das Fenster ist absichtlich sichtbar**, man muss mitlesen,
 * was in die eigenen Dateien geschrieben wird. Das ist richtig, solange man
 * einen Beitrag nach dem anderen anstößt. Es ist aber genau das, was die
 * Kette unmöglich macht — ein Fenster, das auf eine Eingabe wartet, ist kein
 * Kettenglied, und dreißig Beiträge sind dreißig Fenster.
 *
 * Was an die Stelle des Mitlesens tritt, ist kein Vertrauen, sondern:
 *
 * 1. **Derselbe Vertrag.** Die Anleitungen in `anleitungen/` gelten
 *    unverändert, allen voran: geschrieben wird nur zwischen den Markern.
 *    Alles Handgeschriebene bleibt unberührt, weil das Werkzeug `Edit`
 *    benutzt und nicht `Write`.
 * 2. **Dieselben Riegel** wie beim Fenster (siehe ./preflight) — Aufgabe und
 *    Beitrag gegen Positivlisten, Anleitung muss vorhanden sein.
 * 3. **Vollständiges Protokoll.** Jede Zeile, die das Werkzeug ausgibt, geht
 *    ins Auftragsprotokoll. Wer wissen will, was geschehen ist, liest es
 *    hinterher — statt es nebenher zu übersehen.
 * 4. **Ausdrücklich eingeschaltet.** Ohne `autoAssistant` in den
 *    Einstellungen läuft hier nichts; die Kette bietet dann nur ihre
 *    Maschinenschritte an.
 *
 * Der Prompt geht über stdin, nie auf die Kommandozeile — wie beim Chat.
 */

/** Nach dieser Zeit ohne Ende wird abgebrochen. */
const TIMEOUT_MS = 45 * 60_000;

/** So viel Ausgabe wird im Fehlerfall zurückgemeldet. */
const MAX_TAIL = 600;

export type AssistantRunOptions = {
  task: AssistantTask;
  slug?: string | null;
  /** Jede Ausgabezeile, sobald sie da ist — fürs Protokoll. */
  onLine?: (line: string) => void;
  /** Die Prozesskennung, damit ein Abbruch greifen kann. */
  onPid?: (pid: number | null) => void;
  isCanceled?: () => boolean;
};

export type AssistantRunResult =
  | { ok: true; output: string; prompt: string; tool: string }
  | { ok: false; error: string; output: string };

/**
 * Führt eine Aufgabe aus und wartet auf ihr Ende.
 *
 * Anders als `launchAssistant` öffnet das kein Fenster: es startet das
 * Werkzeug im Bibliotheksordner, schickt den Auftrag über die
 * Standardeingabe und liest mit, bis es fertig ist.
 */
export async function runAssistantTask(
  options: AssistantRunOptions,
): Promise<AssistantRunResult> {
  const settings = await readSettings();
  if (!settings.autoAssistant) {
    return {
      ok: false,
      output: "",
      error:
        "Unbeaufsichtigte KI-Schritte sind nicht eingeschaltet. Unter " +
        "Einstellungen → KI-Assistent lässt sich das ändern.",
    };
  }

  const vorpruefung = await checkAssistantTask(options.task, options.slug);
  if (!vorpruefung.ok) {
    return { ok: false, output: "", error: vorpruefung.error };
  }

  const { task, slug, tool } = vorpruefung;
  const prompt = buildPrompt(task, slug);
  const args = [...settings.autoAssistantArgs];

  await noteAssistantRun(`ohne Fenster — ${tool} ${args.join(" ")}: ${prompt}`);

  return new Promise<AssistantRunResult>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(tool, args, {
        cwd: paths.library,
        // Kein shell: true. Der Auftrag geht über stdin, nicht als Argument.
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        ok: false,
        output: "",
        error: `„${tool}" ließ sich nicht starten: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return;
    }

    options.onPid?.(child.pid ?? null);

    let gesammelt = "";
    let rest = "";
    let fertig = false;

    const schliessen = (result: AssistantRunResult) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      options.onPid?.(null);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      schliessen({
        ok: false,
        output: gesammelt,
        error: "Das Werkzeug hat 45 Minuten lang nicht fertig gemeldet.",
      });
    }, TIMEOUT_MS);

    /*
     * Zeilenweise weitergeben: der Auftrag zeigt die letzte Meldung an, und
     * ein halber Satz sähe nach einem Fehler aus.
     */
    const verarbeiten = (chunk: Buffer) => {
      const text = rest + chunk.toString("utf8");
      const zeilen = text.split(/\r?\n/);
      rest = zeilen.pop() ?? "";
      for (const zeile of zeilen) {
        gesammelt += `${zeile}\n`;
        if (zeile.trim()) options.onLine?.(zeile.trim());
      }
    };

    child.stdout?.on("data", verarbeiten);
    child.stderr?.on("data", verarbeiten);

    child.on("error", (error) => {
      schliessen({
        ok: false,
        output: gesammelt,
        error: `„${tool}" ließ sich nicht starten: ${error.message}`,
      });
    });

    child.on("close", (code) => {
      if (rest.trim()) {
        gesammelt += rest;
        options.onLine?.(rest.trim());
      }

      if (options.isCanceled?.()) {
        schliessen({ ok: false, output: gesammelt, error: "Abgebrochen." });
        return;
      }
      if (code === 0) {
        schliessen({ ok: true, output: gesammelt, prompt, tool });
        return;
      }
      schliessen({
        ok: false,
        output: gesammelt,
        error:
          `„${tool} ${args.join(" ")}" endete mit ${code}. ` +
          (gesammelt.trim()
            ? `Zuletzt: ${gesammelt.trim().slice(-MAX_TAIL)}`
            : "Es kam keine Ausgabe."),
      });
    });

    // Den Auftrag hinein, dann zu — sonst wartet das Werkzeug auf mehr.
    child.stdin?.end(prompt, "utf8");
  });
}
