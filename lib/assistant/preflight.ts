import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";
import { isSlug } from "@/lib/library/slug";
import { ITEM_FILES, paths } from "@/lib/paths";
import { libraryStateDir, readSettings } from "@/lib/settings";
import { ensureInstructionFile } from "./install";
import { ASSISTANT_TASKS, INSTRUCTIONS_DIR, needsSlug } from "./tasks";
import type { AssistantTask } from "./tasks";

/*
 * Die Riegel vor jedem Start eines KI-Werkzeugs.
 *
 * Sie stehen HIER und nicht in einem der beiden Starter, weil es inzwischen
 * zwei gibt: das sichtbare Fenster (start.ts) und den unbeaufsichtigten Lauf
 * in der Auftragsschlange (run.ts). Zwei Kopien derselben Prüfungen wären die
 * Sorte Verdopplung, bei der eine Seite irgendwann vergessen wird — und es
 * ist die Sorte Prüfung, bei der genau das teuer ist.
 *
 * Geprüft wird, in dieser Reihenfolge:
 *
 *   1. Die Aufgabe gegen die Positivliste.
 *   2. Das Werkzeug: ist es überhaupt da?
 *   3. Der Beitrag gegen den Index UND gegen das Dateisystem. Zwei
 *      Prüfungen, nicht eine: der Index kann veraltet sein, und die Datei
 *      ist das, was das Werkzeug tatsächlich öffnet.
 *   4. Die Anleitung in der Bibliothek. Ohne sie kennt das Werkzeug die
 *      Regeln nicht — und überschriebe eine handgeschriebene Datei.
 */

export type Preflight =
  | { ok: true; task: AssistantTask; slug: string | null; tool: string }
  | { ok: false; error: string };

function isTask(value: unknown): value is AssistantTask {
  return (ASSISTANT_TASKS as readonly unknown[]).includes(value);
}

export async function checkAssistantTask(
  task: unknown,
  slug?: unknown,
): Promise<Preflight> {
  if (!isTask(task)) {
    return { ok: false, error: "Diese Aufgabe gibt es nicht." };
  }

  const [features, settings] = await Promise.all([
    getFeatures(),
    readSettings(),
  ]);
  const tool = settings.assistantCommand;

  if (features.assistant !== "ok") {
    return {
      ok: false,
      error:
        `Das Werkzeug „${tool}" wurde auf dieser Maschine nicht gefunden. ` +
        "Unter Einstellungen lässt sich ein anderes eintragen — oder der " +
        "Handbetrieb benutzen: im Bibliotheksordner das Werkzeug starten und " +
        "den Auftrag dort eingeben.",
    };
  }

  let checked: string | null = null;
  if (needsSlug(task)) {
    if (!isSlug(slug)) {
      return { ok: false, error: "Der Beitrag ist keine gültige Kennung." };
    }
    const library = await getLibrary();
    if (!library.bySlug.has(slug)) {
      return { ok: false, error: "Diesen Beitrag gibt es nicht." };
    }
    try {
      await fs.access(path.join(paths.items, slug, ITEM_FILES.markdown));
    } catch {
      return {
        ok: false,
        error:
          "Zu diesem Beitrag gibt es keine beitrag.md. Sie lässt sich über " +
          "den Bearbeiten-Knopf anlegen.",
      };
    }
    checked = slug;
  }

  /*
   * Fehlt die Anleitung, wird sie hier angelegt statt nur gemeldet — sonst
   * müsste man für jedes neue Werkzeug erst unter Einstellungen suchen,
   * bevor der erste Versuch überhaupt klappt. Vorhandene Dateien fasst das
   * nicht an (siehe ensureInstructionFile).
   */
  const angelegt = await ensureInstructionFile(task);
  if (!angelegt) {
    return {
      ok: false,
      error:
        `In der Bibliothek fehlt ${INSTRUCTIONS_DIR}/${task}.md, und die ` +
        "Vorlage dafür fehlt auch im Programm — vermutlich ist das Paket " +
        "unvollständig.",
    };
  }

  return { ok: true, task, slug: checked, tool };
}

/**
 * Notiert jeden Start maschinenlokal — nicht in der Bibliothek, die ja
 * weitergegeben wird.
 *
 * Beim unbeaufsichtigten Lauf ist das mehr als Buchhaltung: dort schaut
 * niemand zu, und hinterher ist dieses Protokoll die einzige Stelle, an der
 * steht, was wann losgeschickt wurde.
 */
export async function noteAssistantRun(line: string): Promise<void> {
  try {
    const dir = libraryStateDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(
      path.join(dir, "assistent-starts.log"),
      `${new Date().toISOString()}  ${line}\n`,
      "utf8",
    );
  } catch {
    // Ein nicht schreibbares Protokoll darf den Start nicht verhindern.
  }
}
