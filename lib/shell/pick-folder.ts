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
 *
 * Unter macOS über `osascript` und `choose folder` — der native
 * Finder-Dialog. Ein Abbruch ist dort kein leerer Erfolg, sondern der
 * AppleScript-Fehler -128 ("User canceled."); der wird zu `canceled`, nicht
 * zu einer Fehlermeldung.
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
 *
 * BEWUSST ein OpenFileDialog und kein FolderBrowserDialog: Letzterer ist
 * unter Windows der alte SHBrowseForFolder-Baum ohne Adressleiste, ohne
 * Schnellzugriff, ohne Einfügen eines Pfads — für einen Ordner, der tief
 * verschachtelt oder auf einem Netzlaufwerk liegt, ein mühsames Durchklicken.
 * Der OpenFileDialog ist ab Windows Vista derselbe moderne Explorer, den
 * jedes andere Programm zum Öffnen einer Datei zeigt — nur wird hier eine
 * Datei verlangt, deren Namen es nie geben wird (CheckFileExists = false),
 * damit am Ende der ausgewählte ORDNER übrig bleibt: der Ordner, in den man
 * hineinnavigiert hat, plus dem Platzhalter-Dateinamen im Feld. Ein Klick auf
 * einen Ordner in der Liste öffnet ihn (wie gewohnt) statt ihn auszuwählen —
 * der Kniff kann also nichts falsch zurückgeben, nur tiefer navigieren.
 */
const SKRIPT = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
  "$dialog.Title = 'Ordner fuer die Mediathek waehlen'",
  "$dialog.CheckFileExists = $false",
  "$dialog.CheckPathExists = $true",
  "$dialog.ValidateNames = $false",
  "$dialog.Multiselect = $false",
  // Blendet echte Dateien aus; Ordner bleiben unabhaengig vom Filter sichtbar.
  "$dialog.Filter = 'Ordner|*.kein-echter-dateityp'",
  "$dialog.FileName = 'Diesen Ordner waehlen'",
  // Damit das Fenster nicht hinter dem Browser aufgeht.
  "$vorn = New-Object System.Windows.Forms.Form",
  "$vorn.TopMost = $true",
  "$ergebnis = $dialog.ShowDialog($vorn)",
  "$vorn.Dispose()",
  "if ($ergebnis -eq [System.Windows.Forms.DialogResult]::OK) {",
  "  $ordner = [System.IO.Path]::GetDirectoryName($dialog.FileName)",
  "  [Console]::Out.Write($ordner)",
  "}",
].join("; ");

/**
 * Öffnet den Ordner-Dialog und liefert den gewählten Pfad.
 *
 * Bricht der Nutzer ab, ist das kein Fehler: `canceled`.
 */
export async function pickFolder(): Promise<PickResult> {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return {
      ok: false,
      error:
        "Der Ordner-Dialog gibt es nur unter Windows und macOS. Der Pfad " +
        "lässt sich auch von Hand eintragen.",
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
    return process.platform === "darwin"
      ? await pickFolderMac()
      : await pickFolderWindows();
  } finally {
    globalForPicker.mediathekPickerOpen = false;
  }
}

function pickFolderWindows(): Promise<PickResult> {
  return runPicker(
    "powershell.exe",
    ["-NoProfile", "-STA", "-Command", SKRIPT],
    (ausgabe, fehler, code) => {
      const dir = ausgabe.trim();
      if (dir) return { ok: true, dir };
      if (code === 0) return { ok: false, canceled: true };
      return {
        ok: false,
        error:
          `Der Dialog endete mit ${code}.` +
          (fehler.trim() ? ` ${fehler.trim().slice(0, 200)}` : ""),
      };
    },
  );
}

function pickFolderMac(): Promise<PickResult> {
  return runPicker(
    "osascript",
    [
      "-e",
      'POSIX path of (choose folder with prompt "Ordner für die Mediathek wählen")',
    ],
    (ausgabe, fehler, code) => {
      const dir = normaliseMacDir(ausgabe.trim());
      if (dir) return { ok: true, dir };
      // -128: Nutzer hat Abbrechen gedrückt. Ohne das wäre jeder Abbruch
      // eine Fehlermeldung.
      if (fehler.includes("-128") || /user canceled/i.test(fehler)) {
        return { ok: false, canceled: true };
      }
      return {
        ok: false,
        error:
          `Der Dialog endete mit ${code}.` +
          (fehler.trim() ? ` ${fehler.trim().slice(0, 200)}` : ""),
      };
    },
  );
}

/** Schrägstrich am Ende weg, Unicode in NFC — sonst zählen zwei Schreibweisen. */
function normaliseMacDir(dir: string): string {
  if (!dir) return dir;
  const nfc = dir.normalize("NFC");
  if (nfc === "/") return nfc;
  return nfc.replace(/\/+$/, "");
}

function runPicker(
  command: string,
  args: string[],
  auswerten: (ausgabe: string, fehler: string, code: number | null) => PickResult,
): Promise<PickResult> {
  return new Promise((resolve) => {
    let fertig = false;
    const schliessen = (result: PickResult) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { windowsHide: true, shell: false });
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
      schliessen(auswerten(ausgabe, fehler, code));
    });
  });
}
