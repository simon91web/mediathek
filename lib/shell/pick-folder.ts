import "server-only";

import { spawn } from "node:child_process";

/*
 * Der native Ordner-Dialog.
 *
 * Eine Webseite kann keinen Ordner auswählen — `webkitdirectory` liefert
 * Dateinamen, nie den Pfad des Ordners, und der Pfad ist genau das, was der
 * Server braucht. Deshalb wird hier der Dialog des Betriebssystems geholt.
 *
 * ZWEI DINGE MACHEN DAS VERTRETBAR:
 *
 * 1. **Es geht nichts hinein, nur heraus.** Der Aufruf nimmt keinen Pfad
 *    entgegen, keinen Filter, nichts aus einer Anfrage. Er öffnet einen
 *    Dialog und gibt zurück, was ein Mensch angeklickt hat.
 * 2. **Ein Dialog nach dem anderen.** Zwei gleichzeitig offene wären zwei
 *    Fenster, von denen eines hinter dem anderen liegt und niemand mehr weiß,
 *    welches wozu gehört.
 *
 * Unter Windows über PowerShell mit WinForms. `-STA` ist Pflicht: der
 * Dialog ist ein COM-Objekt und verlangt einen Single-Threaded-Apartment —
 * ohne das kommt kein Fenster, sondern ein Fehler.
 */

/** So lange darf jemand überlegen, bevor abgebrochen wird. */
const TIMEOUT_MS = 5 * 60_000;

const globalForPicker = globalThis as unknown as {
  mediathekPickerOpen?: boolean;
};

export type PickResult =
  | { ok: true; dir: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string };

/**
 * Das PowerShell-Skript für den Dialog.
 *
 * Als eine Zeichenkette und nicht als Datei, weil es NICHTS Veränderliches
 * enthält: keine Eingabe wird hineingereicht, es gibt also auch nichts zu
 * maskieren. Die Ausgabe ist der gewählte Pfad oder nichts.
 */
const SKRIPT = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "$dialog.Description = 'Ordner fuer die Mediathek waehlen'",
  "$dialog.ShowNewFolderButton = $true",
  // Damit das Fenster nicht hinter dem Browser aufgeht.
  "$vorn = New-Object System.Windows.Forms.Form",
  "$vorn.TopMost = $true",
  "$ergebnis = $dialog.ShowDialog($vorn)",
  "$vorn.Dispose()",
  "if ($ergebnis -eq [System.Windows.Forms.DialogResult]::OK) {",
  "  [Console]::Out.Write($dialog.SelectedPath)",
  "}",
].join("; ");

/**
 * Öffnet den Ordner-Dialog und liefert den gewählten Pfad.
 *
 * Bricht der Nutzer ab, ist das kein Fehler: `canceled`.
 */
export async function pickFolder(): Promise<PickResult> {
  if (process.platform !== "win32") {
    return {
      ok: false,
      error:
        "Der Ordner-Dialog gibt es nur unter Windows. Der Pfad lässt sich " +
        "auch von Hand eintragen.",
    };
  }

  if (globalForPicker.mediathekPickerOpen) {
    return {
      ok: false,
      error:
        "Es ist schon ein Ordner-Dialog offen — er liegt womöglich hinter " +
        "diesem Fenster.",
    };
  }
  globalForPicker.mediathekPickerOpen = true;

  try {
    return await new Promise<PickResult>((resolve) => {
      let fertig = false;
      const schliessen = (result: PickResult) => {
        if (fertig) return;
        fertig = true;
        clearTimeout(timer);
        resolve(result);
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(
          "powershell.exe",
          ["-NoProfile", "-STA", "-Command", SKRIPT],
          { windowsHide: true, shell: false },
        );
      } catch (error) {
        schliessen({
          ok: false,
          error: `Der Dialog ließ sich nicht öffnen: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        return;
      }

      const timer = setTimeout(() => {
        child.kill();
        schliessen({ ok: false, canceled: true });
      }, TIMEOUT_MS);

      let ausgabe = "";
      let fehler = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        ausgabe += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        fehler += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        schliessen({
          ok: false,
          error: `Der Dialog ließ sich nicht öffnen: ${error.message}`,
        });
      });

      child.on("close", (code) => {
        const dir = ausgabe.trim();
        if (dir) {
          schliessen({ ok: true, dir });
          return;
        }
        if (code === 0) {
          // Kein Pfad, aber sauber beendet: abgebrochen.
          schliessen({ ok: false, canceled: true });
          return;
        }
        schliessen({
          ok: false,
          error:
            `Der Dialog endete mit ${code}.` +
            (fehler.trim() ? ` ${fehler.trim().slice(0, 200)}` : ""),
        });
      });
    });
  } finally {
    globalForPicker.mediathekPickerOpen = false;
  }
}
