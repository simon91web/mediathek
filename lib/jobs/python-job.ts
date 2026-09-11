import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { invalidateFeatures } from "@/lib/features";
import { JobError } from "./queue";
import type { JobContext } from "./queue";

/*
 * Die Python-Umgebung einrichten — als Auftrag, nicht als Kommandozeile.
 *
 * DER GRUND: im weitergegebenen Paket gibt es kein npm, kein package.json und
 * keinen Projektordner. Die Meldung „einzurichten mit npm run setup:python"
 * war dort schlicht falsch — sie nannte einen Befehl, den es auf der Maschine
 * des Kollegen nicht gibt.
 *
 * Was es dort gibt: node.exe (liegt im Paket), das Skript und tools/. Also
 * ruft die Mediathek dasselbe Skript selbst auf, mit ihrer eigenen node.exe,
 * und zeigt seine Ausgabe wie jeden anderen Auftrag an.
 *
 * WAS SIE NICHT KANN: Python installieren. Das Skript sucht einen
 * Interpreter ab 3.11 und bricht sonst ab — mit genau dieser Auskunft, die
 * dann auch in der Oberfläche steht. Python zu installieren ist ein Eingriff
 * ins System; das gehört nicht in ein Programm, das man in einen Ordner
 * kopiert.
 */

/** Nach dieser Zeit ohne Ende wird abgebrochen — pip lädt viel. */
const TIMEOUT_MS = 60 * 60_000;

export async function runPythonSetupJob(context: JobContext): Promise<void> {
  const { job, update, log, setPid } = context;
  const nurCpu = job.slug === "cpu";

  const skript = path.join(process.cwd(), "scripts", "setup-python.mjs");
  try {
    await fs.access(skript);
  } catch {
    throw new JobError(
      "internal",
      `Das Einrichtungsskript fehlt: ${skript}. Im weitergegebenen Paket ` +
        "gehört es nach app/scripts/.",
    );
  }

  update({
    stage: "python",
    progress: 0.02,
    message: "Python wird gesucht …",
  });

  const args = [skript, ...(nurCpu ? ["--cpu"] : [])];

  await new Promise<void>((resolve, reject) => {
    let fertig = false;
    const schliessen = (fehler?: Error) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      setPid(null);
      if (fehler) reject(fehler);
      else resolve();
    };

    /*
     * process.execPath ist im Paket app\node.exe und in der Entwicklung das
     * node aus dem Suchpfad — in beiden Fällen genau die Fassung, die diesen
     * Server ausführt.
     */
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    setPid(child.pid ?? null);

    const timer = setTimeout(() => {
      child.kill();
      schliessen(
        new JobError(
          "internal",
          "Das Einrichten hat eine Stunde gedauert und wurde abgebrochen.",
        ),
      );
    }, TIMEOUT_MS);

    let rest = "";
    let letzte = "";
    const verarbeiten = (chunk: Buffer) => {
      const text = rest + chunk.toString("utf8");
      const zeilen = text.split(/\r?\n/);
      rest = zeilen.pop() ?? "";
      for (const zeile of zeilen) {
        const sauber = zeile.trim();
        if (!sauber) continue;
        log(sauber);
        letzte = sauber;
        /*
         * pip schreibt pro Paket mehrere Zeilen; angezeigt wird die letzte.
         * Ein Fortschrittsbalken wäre gelogen — wie viele Pakete kommen,
         * weiß erst pip selbst, und die CUDA-Räder sind hunderte Megabyte.
         */
        update({
          message: sauber.length > 160 ? `${sauber.slice(0, 159)}…` : sauber,
          progress: Math.min(0.9, job.progress + 0.01),
        });
      }
    };

    child.stdout?.on("data", verarbeiten);
    child.stderr?.on("data", verarbeiten);

    child.on("error", (fehler) => {
      schliessen(new JobError("internal", fehler.message));
    });

    child.on("close", (code) => {
      if (rest.trim()) {
        log(rest.trim());
        letzte = rest.trim();
      }
      if (context.isCanceled()) {
        schliessen();
        return;
      }
      if (code === 0) {
        schliessen();
        return;
      }
      schliessen(
        new JobError(
          "python_missing",
          letzte ||
            `Das Einrichten endete mit ${code}. Einzelheiten stehen im Protokoll.`,
        ),
      );
    });
  });

  /*
   * Die Werkzeugprüfung hängt an einem Zwischenspeicher von fünf Minuten.
   * Ohne das Verwerfen stünde nach dem Einrichten weiter „Python fehlt".
   */
  invalidateFeatures();
  update({ progress: 1, message: "Python ist eingerichtet." });
}
