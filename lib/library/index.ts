import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { paths } from "@/lib/paths";
import { buildCompleteness } from "./completeness";
import { readCache, writeCache } from "./cache";
import { applyStoredLibraryDir } from "./library-dir";
import { scanLibrary } from "./scan";
import { store } from "./store";
import type {
  Collection,
  GlossaryEntry,
  Question,
  Topic,
  TopicSpot,
  Item,
  LibraryState,
  MediaKind,
  Reference,
  Slug,
  Spot,
} from "./types";

/*
 * Die einzige Tür zur Bibliothek. Alles geht durch diese Funktionen — nie
 * direkt an store.state, denn nach einem Hot Reload wäre das der alte Stand.
 */

/**
 * `analysen/vollstaendigkeit.md` — komplett generiert, kein Marker-Block.
 * Fehlt sie (noch nie geprüft, oder der Ordner existiert nicht), ist das kein
 * Fehler: Fachkundig bleibt dann für jedes Thema "ungeprueft".
 */
async function readCompletenessReportRaw(): Promise<string | null> {
  try {
    return await fs.readFile(
      path.join(paths.analysen, "vollstaendigkeit.md"),
      "utf8",
    );
  } catch {
    return null;
  }
}

function applyStatus(state: LibraryState): LibraryState {
  state.cache = { ...store.cacheStatus };
  state.watch = store.watcher
    ? { mode: store.watcher.mode, error: store.watcher.error }
    : { mode: "aus", error: null };
  return state;
}

async function runScan(options: {
  force?: boolean;
  onlySlugs?: readonly Slug[] | null;
}): Promise<{ state: LibraryState; reparsed: number }> {
  /*
   * Doppelter Boden: der gemerkte Ordner wird schon in instrumentation.ts
   * übernommen. Sollte eine Seite doch vorher dran sein, darf sie nicht die
   * Entwicklungsbibliothek einlesen. Der Aufruf ist nach dem ersten Mal
   * wirkungslos.
   */
  await applyStoredLibraryDir();

  if (store.cache === null) {
    store.cache = await readCache();
    store.cacheStatus.readable = store.cache !== null;
  }

  store.generation += 1;
  const result = await scanLibrary({
    cache: store.cache,
    force: options.force,
    onlySlugs: options.onlySlugs ?? null,
    generation: store.generation,
  });

  /*
   * Bewusst NICHT Teil von scanLibrary/scan.ts: die Lücken-Analyse braucht
   * keine fingerprintbasierte Zwischenspeicherung — sie liest nur bereits
   * geladene Themen und Beiträge (Fachfremd) plus eine einzige generierte
   * Datei (Fachkundig) und ist dafür günstig genug, bei jedem Scan neu zu
   * laufen.
   */
  const reportRaw = await readCompletenessReportRaw();
  const { completeness, problems: completenessProblems } = buildCompleteness(
    result.state.topics,
    result.state.bySlug,
    reportRaw,
  );
  result.state.completeness = completeness;
  if (completenessProblems.length > 0) {
    result.state.problems = [
      ...result.state.problems,
      ...completenessProblems.map((problem) => ({
        path: "analysen/vollstaendigkeit.md",
        message: problem.line
          ? `Zeile ${problem.line}: ${problem.message}`
          : problem.message,
      })),
    ];
  }

  store.state = result.state;
  store.cache = result.cache;

  const written = await writeCache(result.cache);
  store.cacheStatus = {
    readable: true,
    writable: written.ok,
    note: written.note,
  };

  return { state: applyStatus(result.state), reparsed: result.reparsed };
}

/**
 * Liest die Bibliothek, beim ersten Aufruf vom Dateisystem.
 *
 * Parallele Aufrufe teilen sich denselben Scan: auf einem Netzlaufwerk
 * dauert der erste Durchgang lange, und eine Seite mit drei Server
 * Components soll ihn nicht dreimal auslösen.
 */
export async function getLibrary(): Promise<LibraryState> {
  if (store.state) return applyStatus(store.state);
  if (store.loading) return store.loading;

  const loading = runScan({})
    .then((result) => result.state)
    .finally(() => {
      store.loading = null;
    });
  store.loading = loading;
  return loading;
}

export type ReloadResult = {
  generation: number;
  items: number;
  reparsed: number;
  durationMs: number;
};

/**
 * Liest neu ein. `force` ignoriert den Cache vollständig — das ist der
 * Ausweg für den Fall, dass Größe und Zeitstempel gleich geblieben sind,
 * der Inhalt aber nicht.
 */
export async function reloadLibrary(
  options: { force?: boolean; onlySlugs?: readonly Slug[] | null } = {},
): Promise<ReloadResult> {
  const startedAt = Date.now();
  // Ein laufender Erstscan wird abgewartet, nicht verdoppelt.
  if (store.loading) await store.loading.catch(() => {});

  const running = runScan(options);
  store.loading = running
    .then((result) => result.state)
    .finally(() => {
      store.loading = null;
    });
  const { state, reparsed } = await running;

  return {
    generation: state.generation,
    items: state.items.length,
    reparsed,
    durationMs: Date.now() - startedAt,
  };
}

/** Synchron, für die Polling-Route: nur die Kennzahl, kein Scan. */
export function libraryGeneration(): number {
  return store.generation;
}

export async function getItem(slug: string): Promise<Item | null> {
  const library = await getLibrary();
  return library.bySlug.get(slug) ?? null;
}

export async function getTopic(slug: string): Promise<Topic | null> {
  const library = await getLibrary();
  return library.topicsBySlug.get(slug) ?? null;
}

/** Rückverweise auf diesen Beitrag — berechnet, nicht in der Datei gespeichert. */
export async function getBacklinks(slug: string): Promise<Reference[]> {
  const library = await getLibrary();
  return library.backlinks.get(slug) ?? [];
}

/** Die Themen, in denen dieser Beitrag als ganzer vorkommt. */
export async function getTopicsForItem(slug: string): Promise<Topic[]> {
  const library = await getLibrary();
  return library.topicsByItem.get(slug) ?? [];
}

/**
 * Die Fundstellen, die Themenseiten IN diesem Beitrag benannt haben — nach
 * Zeit geordnet. Daraus entsteht "Themen in diesem Beitrag", ohne dass
 * irgendwo eine zweite Liste gepflegt werden müsste.
 */
export async function getTopicSpotsForItem(
  slug: string,
): Promise<TopicSpot[]> {
  const library = await getLibrary();
  return library.topicSpotsByItem.get(slug) ?? [];
}

export async function getGlossaryEntry(
  slug: string,
): Promise<GlossaryEntry | null> {
  const library = await getLibrary();
  return library.glossaryBySlug.get(slug) ?? null;
}

export async function getCollection(slug: string): Promise<Collection | null> {
  const library = await getLibrary();
  return library.collectionsBySlug.get(slug) ?? null;
}

export async function getQuestion(slug: string): Promise<Question | null> {
  const library = await getLibrary();
  return library.questionsBySlug.get(slug) ?? null;
}

/**
 * Alle Fragen, zuletzt gefragte zuerst.
 *
 * `suche` filtert wörtlich über Frage, Umformulierungen und Antwort — kein
 * MiniSearch, keine Synonyme: die Liste ist klein genug, und wer hier sucht,
 * erinnert sich an ein Wort aus der eigenen Frage.
 */
export async function listQuestions(
  options: { search?: string; limit?: number } = {},
): Promise<Question[]> {
  const library = await getLibrary();
  const suche = options.search?.trim().toLowerCase();
  let questions = library.questions;

  if (suche) {
    questions = questions.filter((frage) =>
      [frage.question, ...frage.alsoAsked, frage.answer]
        .join(" ")
        .toLowerCase()
        .includes(suche),
    );
  }

  return options.limit ? questions.slice(0, options.limit) : questions;
}

export type ItemFilter = {
  kinds?: readonly MediaKind[];
  tags?: readonly string[];
  topic?: Slug;
  search?: string;
  sort?: "neu" | "titel" | "dauer";
  limit?: number;
  offset?: number;
};

/**
 * Gefilterte Liste für Mediathek und Themenseiten. Die Volltextsuche über
 * Transkripte ist bewusst nicht hier, sondern in lib/search — das hier ist
 * nur das Filtern der Kacheln.
 */
export async function listItems(
  filter: ItemFilter = {},
): Promise<{ items: Item[]; total: number }> {
  const library = await getLibrary();
  let items = library.items;

  if (filter.topic) {
    const topic = library.topicsBySlug.get(filter.topic);
    if (!topic) return { items: [], total: 0 };
    // Reihenfolge im Thema gewinnt über jede andere Sortierung.
    const ordered = topic.itemSlugs
      .map((slug) => library.bySlug.get(slug))
      .filter((item): item is Item => item !== undefined);
    items = ordered;
  }

  if (filter.kinds && filter.kinds.length > 0) {
    const kinds = new Set(filter.kinds);
    items = items.filter((item) => kinds.has(item.kind));
  }

  if (filter.tags && filter.tags.length > 0) {
    // Mehrere Schlagworte werden als UND verstanden.
    items = items.filter((item) =>
      filter.tags!.every((tag) => item.tags.includes(tag)),
    );
  }

  if (filter.search?.trim()) {
    const needle = filter.search.trim().toLowerCase();
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.tags.some((tag) => tag.includes(needle)),
    );
  }

  if (!filter.topic && filter.sort && filter.sort !== "neu") {
    items = [...items];
    if (filter.sort === "titel") {
      items.sort((a, b) => a.title.localeCompare(b.title, "de"));
    } else {
      items.sort((a, b) => (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0));
    }
  }

  const total = items.length;
  const offset = Math.max(0, filter.offset ?? 0);
  const limit = filter.limit ?? total;
  return { items: items.slice(offset, offset + limit), total };
}

export type {
  Collection,
  GlossaryEntry,
  Question,
  Topic,
  TopicSpot,
  Item,
  LibraryState,
  Reference,
  Slug,
  Spot,
};
