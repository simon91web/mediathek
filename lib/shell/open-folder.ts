import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/*
 * Einen Ordner im Dateimanager öffnen.
 *
 * Warum das die Anwendung tun darf: der Pfad kommt NIE von außen. Er wird
 * immer aus dem Bibliotheksordner abgeleitet, den der Server selbst kennt.
 * Ein Pfad aus einer Anfrage würde hier nichts verloren haben — dann wäre
 * dieser Aufruf ein "öffne mir irgendetwas auf dem Rechner".
 */

export type OpenResult = { ok: true } | { ok: false; error: string };

/** Der Dateimanager der jeweiligen Plattform. */
function fileManager(): { command: string; args: (dir: string) => string[] } {
  if (process.platform === "win32") {
    return { command: "explorer.exe", args: (dir) => [dir] };
  }
  if (process.platform === "darwin") {
    return { command: "open", args: (dir) => [dir] };
  }
  return { command: "xdg-open", args: (dir) => [dir] };
}

export async function openInFileManager(dir: string): Promise<OpenResult> {
  const resolved = path.resolve(dir);

  try {
    const info = await fs.stat(resolved);
    if (!info.isDirectory()) {
      return { ok: false, error: "Das ist kein Ordner." };
    }
  } catch {
    return {
      ok: false,
      error:
        `Der Ordner ist nicht erreichbar: ${resolved} — bei einem ` +
        "Netzlaufwerk vielleicht gerade nicht verbunden.",
    };
  }

  const { command, args } = fileManager();

  try {
    const child = spawn(command, args(resolved), {
      detached: true,
      stdio: "ignore",
      /*
       * KEIN shell: true. Der Pfad ist vertrauenswürdig, aber ein
       * Leerzeichen im Namen ("Meine Mediathek") wäre über eine Shell
       * trotzdem ein zweites Argument.
       */
      shell: false,
    });
    child.unref();
    /*
     * Auf den Rückgabewert wird NICHT gewartet. explorer.exe beendet sich
     * mit 1, auch wenn das Fenster aufgeht — ein Fehler ist das nicht, und
     * wer darauf prüft, meldet jedes Mal einen.
     */
  } catch (error) {
    return {
      ok: false,
      error: `${command} ließ sich nicht starten: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  return { ok: true };
}
