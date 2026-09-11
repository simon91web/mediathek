import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/*
 * Eine Verknüpfung auf dem Schreibtisch anlegen.
 *
 * WARUM NICHT EINFACH EINE .lnk INS PAKET LEGEN: eine Verknüpfung merkt sich
 * einen absoluten Pfad. Das Paket ist aber genau dazu da, kopiert zu werden —
 * auf einen Stick, ins Netzlaufwerk, auf den Rechner eines Kollegen. Eine
 * mitgelieferte Verknüpfung zeigte danach ins Leere und wäre schlimmer als
 * keine.
 *
 * Also entsteht sie erst auf Klick, dort, wo das Programm gerade wirklich
 * liegt. Ziel ist `wscript.exe` mit der VBS-Datei: nur so startet die
 * Mediathek ganz ohne Konsolenfenster.
 *
 * Geschrieben wird auf den Schreibtisch, also außerhalb des Programms.
 * Deshalb NUR auf ausdrücklichen Klick, nie von selbst.
 */

export type ShortcutTarget = {
  /** Der Ordner des Pakets — eine Ebene über dem Arbeitsverzeichnis. */
  packageDir: string;
  /** Die Datei, die ohne Konsolenfenster startet. */
  launcher: string;
  iconFile: string | null;
};

/**
 * Liegt hier ein gepacktes Programm — und wenn ja, wo ist sein Starter?
 *
 * Im Entwicklungsbetrieb gibt es beides nicht; dann fehlt der Knopf, statt
 * eine Verknüpfung auf eine Datei anzubieten, die es nicht gibt.
 */
export async function findLauncher(): Promise<ShortcutTarget | null> {
  if (process.platform !== "win32") return null;

  /*
   * Das Arbeitsverzeichnis ist app/. Dort liegt auch das Hilfsskript, mit
   * dem sich Mediathek.cmd unsichtbar macht — die Verknüpfung ruft es
   * direkt auf und spart damit das kurze Aufblitzen, das beim Doppelklick
   * auf die cmd-Datei entsteht.
   */
  const packageDir = path.dirname(process.cwd());
  const launcher = path.join(process.cwd(), "ohne-konsole.vbs");

  try {
    await fs.access(launcher);
  } catch {
    return null;
  }

  const iconFile = path.join(process.cwd(), "mediathek.ico");
  const hatSymbol = await fs
    .access(iconFile)
    .then(() => true)
    .catch(() => false);

  return { packageDir, launcher, iconFile: hatSymbol ? iconFile : null };
}

export type ShortcutResult =
  { ok: true; file: string } | { ok: false; error: string };

/** Der Schreibtisch des angemeldeten Nutzers. */
function desktopDir(): string | null {
  const home = process.env.USERPROFILE;
  return home ? path.join(home, "Desktop") : null;
}

/**
 * Legt „Mediathek.lnk" auf dem Schreibtisch an.
 *
 * Über PowerShell und das COM-Objekt, das Windows dafür mitbringt — eine
 * .lnk von Hand zu schreiben wäre ein Binärformat mit Muscheln darin.
 */
export async function createDesktopShortcut(): Promise<ShortcutResult> {
  const ziel = await findLauncher();
  if (!ziel) {
    return {
      ok: false,
      error:
        "Hier läuft kein gepacktes Programm — eine Verknüpfung gibt es nur " +
        "für den Ordner aus „npm run paket“.",
    };
  }

  const desktop = desktopDir();
  if (!desktop) {
    return {
      ok: false,
      error: "Der Schreibtisch-Ordner ließ sich nicht finden.",
    };
  }

  const datei = path.join(desktop, "Mediathek.lnk");

  /*
   * Die Pfade werden in einfache Anführungszeichen gesetzt und darin
   * verdoppelt — so behandelt PowerShell sie als reine Zeichenkette, ohne
   * Variablen oder Unterausdrücke darin zu deuten. Sie kommen ohnehin nicht
   * von außen, sondern aus dem eigenen Arbeitsverzeichnis.
   */
  const q = (wert: string) => `'${wert.replace(/'/g, "''")}'`;

  const skript = [
    "$ws = New-Object -ComObject WScript.Shell",
    `$lnk = $ws.CreateShortcut(${q(datei)})`,
    `$lnk.TargetPath = ${q(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "wscript.exe"))}`,
    `$lnk.Arguments = '"' + ${q(ziel.launcher)} + '"'`,
    `$lnk.WorkingDirectory = ${q(ziel.packageDir)}`,
    "$lnk.Description = 'Mediathek starten'",
    ...(ziel.iconFile ? [`$lnk.IconLocation = ${q(ziel.iconFile)}`] : []),
    "$lnk.Save()",
  ].join("; ");

  return new Promise<ShortcutResult>((resolve) => {
    let fertig = false;
    const schliessen = (result: ShortcutResult) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(timer);
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", skript],
        { windowsHide: true, shell: false },
      );
    } catch (error) {
      schliessen({
        ok: false,
        error: `PowerShell ließ sich nicht starten: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return;
    }

    const timer = setTimeout(() => {
      child.kill();
      schliessen({ ok: false, error: "Das hat zu lange gedauert." });
    }, 20_000);

    let fehler = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      fehler += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      schliessen({ ok: false, error: error.message });
    });
    child.on("close", async (code) => {
      if (code !== 0) {
        schliessen({
          ok: false,
          error: `Die Verknüpfung ließ sich nicht anlegen${
            fehler.trim() ? `: ${fehler.trim().slice(0, 200)}` : "."
          }`,
        });
        return;
      }
      // Nachsehen statt glauben: PowerShell meldet 0 auch für manches Nichts.
      try {
        await fs.access(datei);
        schliessen({ ok: true, file: datei });
      } catch {
        schliessen({
          ok: false,
          error: "Die Verknüpfung wurde nicht angelegt.",
        });
      }
    });
  });
}
