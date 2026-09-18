"use server";

import fs from "node:fs/promises";
import path from "node:path";

import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { collectMediaFiles } from "@/lib/import/collect";
import { importFile } from "@/lib/import/import-file";
import { enqueueAutoJobs } from "@/lib/jobs/auto";
import { reloadLibrary } from "@/lib/library";

export type FolderImportResult = {
  ok: boolean;
  /** Was eingelesen wurde, je Datei eine Zeile. */
  lines: string[];
  imported: string[];
  error: string | null;
};

/**
 * Liest einen Ordner ein, der schon irgendwo auf der Platte liegt.
 *
 * Kopieren ist der Standard: die Quelldateien sind unter Umständen die
 * einzigen Originale. Verschieben verlangt einen ausdrücklichen Wunsch.
 */
export async function importFolderAction(input: {
  pfad: string;
  verschieben: boolean;
}): Promise<FolderImportResult> {
  try {
    await assertAuthorMode();
  } catch (error) {
    return {
      ok: false,
      lines: [],
      imported: [],
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Einlesen ist nicht möglich.",
    };
  }

  const dir = input.pfad.trim().replace(/^"|"$/g, "");
  if (!dir) {
    return { ok: false, lines: [], imported: [], error: "Bitte einen Pfad angeben." };
  }

  try {
    const info = await fs.stat(dir);
    if (!info.isDirectory()) {
      return {
        ok: false,
        lines: [],
        imported: [],
        error: `"${dir}" ist kein Ordner.`,
      };
    }
  } catch {
    return {
      ok: false,
      lines: [],
      imported: [],
      error: `"${dir}" ist nicht erreichbar. Bei einem Netzlaufwerk hilft der UNC-Pfad.`,
    };
  }

  const collected = await collectMediaFiles(dir);
  if (!collected.ok) {
    return { ok: false, lines: [], imported: [], error: collected.error };
  }
  const files = collected.files;

  const lines: string[] = [];
  const imported: string[] = [];

  /*
   * Nacheinander, nicht parallel: auf einem Netzlaufwerk halbiert
   * Gleichzeitigkeit den Durchsatz und verdoppelt die Fehlerfälle.
   */
  for (const file of files) {
    const outcome = await importFile(file, {
      move: input.verschieben,
      originalName: path.basename(file),
    });
    if (outcome.ok) {
      imported.push(outcome.slug);
      lines.push(outcome.note);
    } else {
      lines.push(outcome.error);
    }
  }

  if (imported.length > 0) {
    await reloadLibrary({ onlySlugs: imported });

    /*
     * Erst einlesen, dann anstellen: enqueueAutoJobs schaut im Index nach,
     * was dem Beitrag fehlt, und der Index muss ihn dafür kennen.
     */
    let jobs = 0;
    for (const slug of imported) {
      jobs += (await enqueueAutoJobs(slug)).length;
    }
    if (jobs > 0) {
      lines.push(
        `${jobs} ${jobs === 1 ? "Auftrag" : "Aufträge"} angestellt — ` +
          "der Fortschritt steht unter Aufträge.",
      );
    }

    revalidatePath("/", "layout");
  }

  return { ok: imported.length > 0, lines, imported, error: null };
}
