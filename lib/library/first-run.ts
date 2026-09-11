import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { installInstructions } from "@/lib/assistant/install";
import { LIBRARY_DIR_FIXED } from "@/lib/paths";
import { readSettings } from "@/lib/settings";
import { checkLibraryDir } from "./library-dir";
import { planLibraryFolder } from "./new-library";
import { switchLibrary } from "./switch";

/*
 * Der erste Start.
 *
 * Ein frisch ausgepacktes Programm weiß nicht, wo die Bibliothek liegen soll
 * — und darf es auch nicht raten. Statt stillschweigend irgendwo einen Ordner
 * anzulegen, fragt es einmal. Danach steht der Pfad maschinenlokal in
 * `settings.json` und die Frage kommt nie wieder.
 *
 * WORAN „erster Start" ERKANNT WIRD, in dieser Reihenfolge:
 *
 * 1. `MEDIATHEK_LIBRARY_DIR` gesetzt → nein. Die Variable ist die Ansage
 *    eines Launchers oder Administrators; wer sie setzt, hat entschieden.
 * 2. Ein gemerkter Ordner, der noch existiert → nein.
 * 3. Sonst → ja, auch wenn ein gemerkter Ordner dasteht, der weg ist. Ein
 *    abgezogener Stick ist genau der Moment, in dem man wieder gefragt
 *    werden will.
 *
 * Die Entwicklungsbibliothek `./bibliothek-dev` zählt dabei mit: sie ist der
 * eingebaute Standard, und wer entwickelt, soll nicht bei jedem Start einen
 * Begrüßungsschirm wegklicken.
 */

export type FirstRunState =
  | { needed: false }
  | {
      needed: true;
      /** Ein gemerkter Ordner, der nicht mehr erreichbar ist. */
      lostDir: string | null;
      /** Ein guter Vorschlag fürs Verzeichnis — der eigene Dokumente-Ordner. */
      suggestedParent: string;
      suggestedName: string;
    };

/** Wo eine neue Bibliothek am ehesten hingehört. */
function defaultParent(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return home ? path.join(home, "Documents") : "";
}

export async function firstRunState(): Promise<FirstRunState> {
  if (LIBRARY_DIR_FIXED) return { needed: false };

  const settings = await readSettings();
  const stored = settings.lastLibraryDir?.trim();

  if (stored) {
    const check = await checkLibraryDir(stored);
    if (check.ok) return { needed: false };
    return {
      needed: true,
      lostDir: stored,
      suggestedParent: defaultParent(),
      suggestedName: "Mediathek",
    };
  }

  /*
   * Kein gemerkter Ordner: im Entwicklungsbetrieb ist das der Normalfall, weil
   * ./bibliothek-dev als Standard gilt.
   *
   * Geprüft wird `!fresh`, also ob dort wirklich ein `medien/` liegt — und
   * das ist kein Feinschliff, sondern der Fehler, der im gepackten Programm
   * auftrat: der erste Scan legt `bibliothek-dev/library.json` im
   * PROGRAMMORDNER an, und ein bloßes `ok` hätte diesen Ordner ab dem
   * zweiten Start für die Bibliothek gehalten. Der Begrüßungsschirm wäre
   * genau einmal erschienen und danach nie wieder — mit einer Bibliothek im
   * Programmverzeichnis, die beim nächsten Update mitgelöscht wäre.
   */
  const check = await checkLibraryDir(
    path.join(process.cwd(), "bibliothek-dev"),
  );
  if (check.ok && !check.fresh) return { needed: false };

  return {
    needed: true,
    lostDir: null,
    suggestedParent: defaultParent(),
    suggestedName: "Mediathek",
  };
}

export type CreateLibraryResult =
  | { ok: true; dir: string; created: boolean }
  | { ok: false; error: string };

/**
 * Legt die Bibliothek an und stellt darauf um.
 *
 * „Anlegen" ist mehr als `mkdir`: der Ordner bekommt sein `medien/` und den
 * Vertrag aus `anleitungen/` — sonst stünde beim ersten KI-Auftrag „In der
 * Bibliothek fehlt anleitungen/kapitel.md", und niemand wüsste, warum.
 *
 * Ein vorhandener Ordner wird NICHT überschrieben und nicht geleert. Wer auf
 * einen bestehenden zeigt, will genau den.
 */
export async function createLibrary(input: {
  parent: string;
  name: string;
  /** Den gewählten Ordner selbst nehmen, statt darin einen anzulegen. */
  useParent?: boolean;
}): Promise<CreateLibraryResult> {
  const plan = planLibraryFolder(input.parent, input.name);
  if (!plan.ok) return plan;

  const ziel = input.useParent ? path.resolve(input.parent) : plan.target;

  let created = false;
  try {
    const info = await fs.stat(ziel).catch(() => null);
    if (info && !info.isDirectory()) {
      return { ok: false, error: `„${ziel}" ist eine Datei, kein Ordner.` };
    }
    if (!info) {
      await fs.mkdir(ziel, { recursive: true });
      created = true;
    }
    // Der Ordner, in dem die Beiträge liegen — ab jetzt ist es eine Bibliothek.
    await fs.mkdir(path.join(ziel, "medien"), { recursive: true });
  } catch (error) {
    return {
      ok: false,
      error: `Der Ordner ließ sich nicht anlegen: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  /*
   * Erst umstellen, dann den Vertrag hineinlegen: `installInstructions`
   * schreibt nach `paths.library`, und das ist bis zum Wechsel noch der alte
   * Ordner.
   */
  const wechsel = await switchLibrary(ziel);
  if (!wechsel.ok) return { ok: false, error: wechsel.error };

  await installInstructions();
  return { ok: true, dir: ziel, created };
}

/** Auf einen bestehenden Ordner umstellen — der andere Weg im Begrüßungsschirm. */
export async function openExistingLibrary(
  dir: string,
): Promise<CreateLibraryResult> {
  const check = await checkLibraryDir(dir);
  if (!check.ok) return { ok: false, error: check.error };

  const wechsel = await switchLibrary(check.dir);
  if (!wechsel.ok) return { ok: false, error: wechsel.error };

  /*
   * Auch ein bestehender Ordner bekommt die Anleitungen, wenn sie fehlen —
   * vorhandene werden dabei nie überschrieben. Eine Bibliothek vom
   * Netzlaufwerk bringt sie meist schon mit.
   */
  await installInstructions();
  return { ok: true, dir: check.dir, created: false };
}
