import "server-only";

import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";
import type { Item, Slug } from "@/lib/library/types";
import { readSettings } from "@/lib/settings";
import { prepareJobs } from "./index";
import { getQueue } from "./queue";
import type { JobKind } from "./types";

/*
 * Die Kette: ein Beitrag, von der Rohdatei bis zum verknüpften Wissen.
 *
 *   Transkription → Kapitel → Suche → Bezüge
 *
 * Bisher war das vier Knöpfe, zwischen denen man warten und nachsehen musste,
 * ob der vorige fertig ist. Bei einem Beitrag geht das; bei dreißig ist es
 * die Arbeit, für die man ein Programm hat.
 *
 * DIE REIHENFOLGE IST DIE BEGRÜNDUNG, nicht bloß eine Anordnung:
 *
 * 1. **Transkription** — vorher gibt es nichts zu lesen.
 * 2. **Kapitel** braucht das Transkript. Ohne es müsste ein Sprachmodell
 *    raten, und die Anleitung verbietet genau das.
 * 3. **Suche** indiziert Transkript UND Kapitel. Davor gebaut, enthielte der
 *    Index den halben Beitrag.
 * 4. **Bezüge** suchen verwandte Stellen in ALLEN Beiträgen — der Schritt
 *    profitiert vom frischen Index und arbeitet mit den Kapiteln als
 *    Orientierung.
 *
 * Deshalb wird ein Glied ÜBERSPRUNGEN, wenn ein früheres nicht durchlief
 * (siehe queue.ts): Kapitel ohne Transkript wären erfunden, und eine
 * erfundene Kapitelzeile ist schlimmer als keine.
 *
 * Die Schlange ist ohnehin seriell — die Reihenfolge des Anstellens ist also
 * die Reihenfolge der Ausführung. Es braucht keinen zweiten Ablaufplaner.
 */

/** Die Glieder in ihrer Reihenfolge. */
export const CHAIN_ORDER: readonly JobKind[] = [
  "transkription",
  "kapitel",
  "suchindex",
  "bezuege",
];

export type ChainStep = {
  kind: JobKind;
  /** Angestellt, oder warum nicht. */
  state: "angestellt" | "schon-da" | "fehlt-werkzeug" | "nicht-noetig";
  note?: string;
};

export type ChainResult = {
  ok: boolean;
  slug: string;
  steps: ChainStep[];
  /** Wie viele Aufträge tatsächlich in der Schlange stehen. */
  queued: number;
  error?: string;
};

/**
 * Was für diesen Beitrag noch fehlt.
 *
 * `erneut` erzwingt alles — das ist der Knopf „noch einmal durchlaufen", wenn
 * etwa das Transkript neu gemacht wurde und die Kapitel nicht mehr passen.
 */
function needed(item: Item, kind: JobKind, erneut: boolean): boolean {
  /*
   * Ohne Mediendatei gibt es nichts zu transkribieren — auch nicht beim
   * Erzwingen. Diese Prüfung macht sonst `startJob`, und daran kommt die
   * Kette vorbei.
   */
  if (kind === "transkription" && !item.assets.mediaFile) return false;

  if (erneut) {
    // Ein Textbeitrag bekommt auch beim Erzwingen kein Transkript.
    if (kind === "transkription") return item.kind !== "text";
    return true;
  }
  switch (kind) {
    case "transkription":
      return item.kind !== "text" && !item.hasTranscript;
    case "kapitel":
      return item.chapters.length === 0;
    case "suchindex":
      return true;
    case "bezuege":
      return item.references.length === 0;
    default:
      return false;
  }
}

/**
 * Stellt die Kette für einen Beitrag an.
 *
 * Angestellt, nicht gestartet: die Schlange arbeitet seriell, zwanzig
 * Beiträge ergeben also zwanzig Wartende und keine zwanzig gleichzeitigen
 * Läufe.
 */
export async function startChain(
  slug: Slug,
  options: { erneut?: boolean } = {},
): Promise<ChainResult> {
  const [library, features, settings] = await Promise.all([
    getLibrary(),
    getFeatures(),
    readSettings(),
  ]);

  const item = library.bySlug.get(slug);
  if (!item) {
    return {
      ok: false,
      slug,
      steps: [],
      queued: 0,
      error: "Diesen Beitrag gibt es nicht.",
    };
  }

  /*
   * Erst anmelden, dann anstellen: die Schlange lebt auf globalThis und
   * überlebt einen Hot Reload — die Zuordnung Art → Ablauf nicht. Ohne
   * diesen Aufruf lägen die Aufträge in einer Schlange, die ihre Art nicht
   * kennt.
   */
  await prepareJobs();
  const queue = getQueue();

  const chainId = `kette-${Date.now().toString(36)}-${slug}`;
  const steps: ChainStep[] = [];
  let step = 0;
  let queued = 0;

  for (const kind of CHAIN_ORDER) {
    if (!needed(item, kind, options.erneut === true)) {
      steps.push({
        kind,
        state:
          item.kind === "text" && kind === "transkription"
            ? "nicht-noetig"
            : "schon-da",
      });
      continue;
    }

    // Ohne Werkzeug wird übersprungen — das ist der Normalfall beim Zuschauer.
    if (kind === "transkription" && features.python !== "ok") {
      steps.push({
        kind,
        state: "fehlt-werkzeug",
        note: "Python fehlt — einzurichten mit npm run setup:python.",
      });
      continue;
    }
    if (kind === "transkription" && features.ffmpeg !== "ok") {
      steps.push({ kind, state: "fehlt-werkzeug", note: "ffmpeg fehlt." });
      continue;
    }
    if (kind === "kapitel" || kind === "bezuege") {
      if (features.assistant !== "ok") {
        steps.push({
          kind,
          state: "fehlt-werkzeug",
          note: `Das Werkzeug „${features.assistantCommand}" wurde nicht gefunden.`,
        });
        continue;
      }
      if (!settings.autoAssistant) {
        steps.push({
          kind,
          state: "fehlt-werkzeug",
          note:
            "Unbeaufsichtigte KI-Schritte sind aus. Einstellungen → " +
            "KI-Assistent.",
        });
        continue;
      }
    }

    /*
     * Läuft dieselbe Art für denselben Beitrag schon, wird nichts Zweites
     * angestellt — das ist die Antwort auf einen doppelten Klick, keine
     * Fehlermeldung.
     */
    if (queue.activeFor(slug, kind)) {
      steps.push({ kind, state: "schon-da", note: "läuft bereits" });
      continue;
    }

    step += 1;
    queue.enqueue({
      kind,
      slug,
      title: item.title,
      chain: { id: chainId, step, total: CHAIN_ORDER.length },
    });
    steps.push({ kind, state: "angestellt" });
    queued += 1;
  }

  return { ok: true, slug, steps, queued };
}

export type ChainAllResult = {
  items: number;
  queued: number;
  /** Was gar nicht ging, je Grund einmal genannt. */
  skipped: string[];
};

/**
 * Die Kette für alles, was noch etwas braucht.
 *
 * Der häufigste Fall überhaupt: es liegen Beiträge da, die nie durchgelaufen
 * sind — importiert, bevor es die Automatik gab, oder unterwegs gescheitert.
 */
export async function startChainForAll(): Promise<ChainAllResult> {
  const library = await getLibrary();

  const skipped = new Set<string>();
  let items = 0;
  let queued = 0;

  for (const item of library.items) {
    const result = await startChain(item.slug);
    if (!result.ok) continue;
    for (const step of result.steps) {
      if (step.state === "fehlt-werkzeug" && step.note) skipped.add(step.note);
    }
    if (result.queued > 0) {
      items += 1;
      queued += result.queued;
    }
  }

  return { items, queued, skipped: [...skipped] };
}
