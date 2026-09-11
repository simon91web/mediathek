"use server";

import path from "node:path";

import { revalidatePath } from "next/cache";

import {
  createLibrary,
  openExistingLibrary,
} from "@/lib/library/first-run";
import { checkLibraryDir } from "@/lib/library/library-dir";
import { planLibraryFolder } from "@/lib/library/new-library";
import { pickFolder } from "@/lib/shell/pick-folder";

/*
 * Der Begrüßungsschirm beim ersten Start.
 *
 * Diese Aktionen prüfen bewusst NICHT auf Autorenmodus. Der Grund: sie laufen
 * genau dann, wenn es noch gar keine Bibliothek gibt — es ist nichts da, was
 * zu schützen wäre, und wer das Programm gestartet hat, sitzt davor. Alles
 * Übrige (Import, Editor, KI) verlangt den Autorenmodus wie bisher.
 *
 * Der Riegel liegt woanders: ist der Ordner über MEDIATHEK_LIBRARY_DIR
 * festgelegt, lehnt `switchLibrary` jeden Wechsel ab — so ist ein
 * ausgeliefertes Paket eingerichtet.
 */

export type PickResultView =
  | { ok: true; dir: string }
  | { ok: false; canceled: boolean; error?: string };

/** Öffnet den Ordner-Dialog des Betriebssystems. */
export async function pickFolderAction(): Promise<PickResultView> {
  const result = await pickFolder();
  if (result.ok) return { ok: true, dir: result.dir };
  if (result.canceled) return { ok: false, canceled: true };
  return { ok: false, canceled: false, error: result.error };
}

export type PreviewResult = {
  /** Der Pfad, der entstünde — zum Anzeigen, bevor geklickt wird. */
  target: string | null;
  /** Gibt es den Zielordner schon? */
  targetExists: boolean;
  /** Enthält er schon eine Bibliothek (medien/)? */
  targetIsLibrary: boolean;
  /**
   * Der gewählte Ordner heißt bereits so wie der Name — dann wird
   * vorgeschlagen, ihn selbst zu nehmen.
   */
  suggestParent: boolean;
  /** Enthält der gewählte Ordner schon eine Bibliothek? */
  parentIsLibrary: boolean;
  error: string | null;
};

/**
 * Die Vorschau für „Neu anlegen": was entsteht, wenn man jetzt klickt.
 *
 * Läuft bei jedem Tastendruck im Namensfeld. Sie legt nichts an und ändert
 * nichts — sie schaut nur nach, was es schon gibt.
 */
export async function previewLibraryAction(input: {
  parent: string;
  name: string;
}): Promise<PreviewResult> {
  const leer: PreviewResult = {
    target: null,
    targetExists: false,
    targetIsLibrary: false,
    suggestParent: false,
    parentIsLibrary: false,
    error: null,
  };

  if (!input.parent.trim()) return leer;

  const plan = planLibraryFolder(input.parent, input.name);
  if (!plan.ok) {
    return { ...leer, error: input.name.trim() ? plan.error : null };
  }

  const [ziel, eltern] = await Promise.all([
    checkLibraryDir(plan.target),
    checkLibraryDir(path.resolve(input.parent)),
  ]);

  return {
    target: plan.target,
    targetExists: ziel.ok,
    targetIsLibrary: ziel.ok && !ziel.fresh,
    suggestParent: plan.suggestParent,
    parentIsLibrary: eltern.ok && !eltern.fresh,
    error: null,
  };
}

export type StartResult =
  | { ok: true; dir: string; created: boolean }
  | { ok: false; error: string };

/** Legt die Bibliothek an (oder nimmt den gewählten Ordner) und stellt um. */
export async function createLibraryAction(input: {
  parent: string;
  name: string;
  useParent?: boolean;
}): Promise<StartResult> {
  const result = await createLibrary(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Stellt auf einen bestehenden Ordner um. */
export async function openExistingLibraryAction(
  dir: string,
): Promise<StartResult> {
  const result = await openExistingLibrary(dir);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
