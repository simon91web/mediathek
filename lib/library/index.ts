import "server-only";

import { readCache, writeCache } from "./cache";
import { scanLibrary } from "./scan";
import { store } from "./store";
import type {
  Topic,
  Item,
  LibraryState,
  MediaKind,
  Reference,
  Slug,
} from "./types";

/*
 * Die einzige Tür zur Bibliothek. Alles geht durch diese Funktionen — nie
 * direkt an store.state, denn nach einem Hot Reload wäre das der alte Stand.
 */

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

/** Die Themen, in denen dieser Beitrag vorkommt. */
export async function getTopicsForItem(slug: string): Promise<Topic[]> {
  const library = await getLibrary();
  return library.topicsByItem.get(slug) ?? [];
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

export type { Topic, Item, LibraryState, Reference, Slug };
