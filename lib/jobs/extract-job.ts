import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

import { getItem, reloadLibrary } from "@/lib/library";
import { invalidateSearchIndex } from "@/lib/search";
import { JobError } from "./queue";
import type { JobContext } from "./queue";
import { childEnv, findPythonEnv } from "./python";

/**
 * Text aus Anhängen ziehen, damit die Suche ihn findet.
 *
 * Ein Handout, das nur als PDF am Beitrag hängt, ist sonst für die Suche
 * unsichtbar — und genau dort steht oft, was im Gesprochenen nur angerissen
 * wird.
 */
export async function runExtractJob(context: JobContext): Promise<void> {
  const { job, update, log } = context;

  const item = await getItem(job.slug);
  if (!item) {
    throw new JobError("internal", `Den Beitrag "${job.slug}" gibt es nicht.`);
  }
  if (!item.assets.attachmentsDir) {
    throw new JobError("internal", "Dieser Beitrag hat keine Anhänge.");
  }

  const python = await findPythonEnv();
  if (!python) {
    throw new JobError(
      "python_missing",
      "Die Python-Umgebung fehlt — sie liest den Text aus den Anhängen. " +
        "Einzurichten unter Einstellungen → Verarbeitung.",
    );
  }

  const script = path.join(python.toolsDir, "extract_text.py");
  update({ stage: "extract", message: "Anhänge werden gelesen …" });

  const child = spawn(
    python.exe,
    [script, "--dir", item.assets.attachmentsDir],
    {
      cwd: python.toolsDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      // Kein ffmpeg nötig; PATH bleibt trotzdem konsistent.
      env: childEnv(python, null),
    },
  );
  context.setPid(child.pid ?? null);

  let finalMessage = "Fertig.";
  const failures: string[] = [];

  child.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.trim()) log(line.trimEnd());
    }
  });

  const lines = readline.createInterface({
    input: child.stdout!,
    crlfDelay: Infinity,
  });

  lines.on("line", (line) => {
    if (!line.trim()) return;
    let event: { type: string; [key: string]: unknown };
    try {
      event = JSON.parse(line);
    } catch {
      log(`stdout: ${line}`);
      return;
    }

    switch (event.type) {
      case "stage":
        update({
          stage: String(event.stage),
          message: String(event.message ?? ""),
        });
        break;
      case "progress":
        update({ progress: Number(event.ratio) || 0 });
        break;
      case "warn":
        log(`Hinweis: ${String(event.message)}`);
        update({ message: String(event.message) });
        break;
      case "done":
        finalMessage = String(event.message ?? "Fertig.");
        break;
      case "error":
        failures.push(String(event.message ?? "Fehlgeschlagen."));
        break;
      default:
        break;
    }
  });

  const code = await new Promise<number>((resolve) => {
    child.on("error", (error) => {
      failures.push(error.message);
      resolve(-1);
    });
    child.on("close", (exitCode) => resolve(exitCode ?? -1));
  });

  lines.close();
  context.setPid(null);

  const failure = failures[0];
  if (failure) throw new JobError("internal", failure);
  if (code !== 0) {
    throw new JobError("internal", `Das Lesen endete mit Code ${code}.`);
  }

  /*
   * `force`, und das ist wichtig: die Auszüge liegen in anhaenge/.text/ und
   * gehen bewusst NICHT in den Fingerprint des Beitrags ein (sonst kostete
   * jeder Scan ein zusätzliches readdir je Beitrag). Ohne force wäre der
   * Fingerprint unverändert, der Scan nähme den Cache — und `hasText` bliebe
   * falsch, der Text also unsichtbar für die Suche.
   *
   * Betroffen ist nur dieser eine Beitrag: onlySlugs begrenzt das erneute
   * Auslesen, alle anderen kommen weiter aus dem Cache.
   */
  await reloadLibrary({ onlySlugs: [job.slug], force: true });
  // Der Suchindex kennt den neuen Text noch nicht.
  invalidateSearchIndex();
  update({ progress: 1, message: finalMessage });
}
