import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { LIBRARY_DIR_FIXED, libraryRoot, setLibraryRoot } from "@/lib/paths";
import { readSettings } from "@/lib/settings";

/*
 * Woher der Bibliotheksordner kommt — und ob der eingetippte taugt.
 *
 * lib/paths.ts hält den Pfad nur; gelesen wird die Einstellung hier, weil
 * paths.ts über urls.ts im Client-Bundle landet und dort nichts aus node:fs
 * anfassen darf.
 */

const globalForLibraryDir = globalThis as unknown as {
  mediathekLibraryDirApplied?: boolean;
};

/**
 * Übernimmt den gemerkten Ordner. Wird beim Serverstart gerufen und
 * zusätzlich vor dem ersten Scan — sicherheitshalber, damit eine Seite, die
 * irgendwie vor instrumentation.ts dran ist, nicht den falschen Ordner liest.
 *
 * Ist MEDIATHEK_LIBRARY_DIR gesetzt, wird nichts übernommen: die Variable
 * gewinnt, und genau das soll sie im Viewer-Paket leisten.
 */
export async function applyStoredLibraryDir(): Promise<void> {
  if (globalForLibraryDir.mediathekLibraryDirApplied) return;
  globalForLibraryDir.mediathekLibraryDirApplied = true;
  if (LIBRARY_DIR_FIXED) return;

  const settings = await readSettings();
  const stored = settings.lastLibraryDir?.trim();
  if (!stored) return;

  /*
   * Ein gemerkter Ordner, der nicht mehr da ist (Netzlaufwerk nicht
   * verbunden, Stick abgezogen), darf den Start nicht verhindern. Dann gilt
   * der Standard, und die Einstellungsseite zeigt den Hinweis.
   */
  const check = await checkLibraryDir(stored);
  if (check.ok) {
    setLibraryRoot(check.dir);
    return;
  }
  console.warn(
    `[bibliothek] Der gemerkte Ordner ist nicht nutzbar (${stored}): ` +
      `${check.error} Es gilt ${libraryRoot()}.`,
  );
}

export type LibraryDirCheck =
  | {
      ok: true;
      /** Aufgelöst und normalisiert. */
      dir: string;
      /** true, wenn es dort noch keinen medien/-Ordner gibt. */
      fresh: boolean;
    }
  | { ok: false; error: string };

/**
 * Prüft einen eingetippten Pfad, bevor er gilt.
 *
 * Bewusst wird der Ordner NICHT angelegt: ein Tippfehler soll keinen
 * verwaisten Ordner auf der Platte hinterlassen, und ein Netzlaufwerk, das
 * gerade nicht verbunden ist, soll als solches gemeldet werden statt still
 * neu zu entstehen.
 *
 * Schreibbarkeit wird nicht verlangt: eine nur lesbare Freigabe ist ein
 * gültiger Betriebszustand — dann ist die Mediathek eben zum Ansehen.
 */
export async function checkLibraryDir(input: string): Promise<LibraryDirCheck> {
  const text = input.trim().replace(/^"|"$/g, "");
  if (!text) {
    return { ok: false, error: "Es ist kein Pfad angegeben." };
  }

  /*
   * Ein relativer Pfad würde gegen das Arbeitsverzeichnis des Servers
   * aufgelöst — nicht gegen das, was der Nutzer im Kopf hat. Lieber ablehnen
   * als heimlich woanders landen.
   */
  if (!path.isAbsolute(text)) {
    return {
      ok: false,
      error:
        "Bitte den vollständigen Pfad angeben, etwa S:\\Mediathek oder " +
        "\\\\10.0.4.200\\Geteilt\\Mediathek.",
    };
  }

  const dir = path.resolve(text);

  let info;
  try {
    info = await fs.stat(dir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        ok: false,
        error:
          "Diesen Ordner gibt es nicht. Er muss vorher angelegt werden — " +
          "die Mediathek legt ihn nicht selbst an, damit ein Tippfehler " +
          "keinen Ordner hinterlässt.",
      };
    }
    if (code === "EPERM" || code === "EACCES") {
      return { ok: false, error: "Auf diesen Ordner besteht kein Zugriff." };
    }
    return {
      ok: false,
      error: `Der Ordner ist nicht lesbar: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (!info.isDirectory()) {
    return { ok: false, error: "Das ist eine Datei, kein Ordner." };
  }

  try {
    await fs.readdir(dir);
  } catch (error) {
    return {
      ok: false,
      error: `Der Ordner lässt sich nicht lesen: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  let fresh = true;
  try {
    const items = await fs.stat(path.join(dir, "medien"));
    fresh = !items.isDirectory();
  } catch {
    // Kein medien/ — ein leerer Ordner ist eine gültige neue Bibliothek.
  }

  return { ok: true, dir, fresh };
}
