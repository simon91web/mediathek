import type { LibraryCache } from "./cache";
import type { LibraryState, Slug } from "./types";

/*
 * Der Zustand der Bibliothek lebt in einem Modul-Singleton auf globalThis.
 *
 * Drei Regeln, die den Hot-Reload-Fall wirklich lösen:
 *
 * 1. IMMER auf globalThis, nicht nur wenn NODE_ENV !== "production".
 *    instrumentation.ts lädt seine Module per await import(); unter Turbopack
 *    kann das im Entwicklungsbetrieb eine andere Modulinstanz sein als die der
 *    Route Handler. Der Watcher muss aber denselben Zustand sehen wie die
 *    Seiten.
 * 2. Diese Datei hat KEINE Nebenwirkungen außer dem Erzeugen des Objekts —
 *    kein Scan, kein Watcher, keine Ausgabe.
 * 3. Nichts auf Modulebene aus dem Store ableiten. Kein
 *    "export const items = store.state?.items" — nach einem Reload zeigt das
 *    auf den alten Stand. Alles geht durch die Funktionen in ./index.
 */

export type WatchHandle = {
  mode: LibraryState["watch"]["mode"];
  error: string | null;
  close(): void;
};

export type LibraryStore = {
  state: LibraryState | null;
  /** Läuft gerade ein Scan? Verhindert Scan-Stürme bei parallelen Seiten. */
  loading: Promise<LibraryState> | null;
  cache: LibraryCache | null;
  cacheStatus: { readable: boolean; writable: boolean; note: string | null };
  watcher: WatchHandle | null;
  generation: number;
  /**
   * Eigene Schreibvorgänge (Editor, Import, Transkription) mit Zeitstempel.
   * Der Watcher ignoriert sie, damit ein Speichern keinen Rescan auslöst.
   */
  ownWrites: Map<string, number>;
  /**
   * Wann zuletzt selbst geschrieben wurde. Der Poller braucht das: eine
   * Änderung, die vom Editor oder Import kommt, darf nicht als "der
   * Beobachter meldet nichts" gewertet werden.
   */
  lastOwnWriteAt: number;
  /**
   * Schreibsperre je Beitrag. Verhindert, dass Editor und Import gleichzeitig
   * an derselben Datei arbeiten — und dass ein Verschieben eine Datei
   * anfasst, die gerade gestreamt wird (Windows sperrt lesend geöffnete
   * Dateien gegen Umbenennen).
   */
  locks: Map<Slug, Promise<unknown>>;
};

const globalForLibrary = globalThis as unknown as {
  mediathekLibrary?: LibraryStore;
};

export const store: LibraryStore = (globalForLibrary.mediathekLibrary ??= {
  state: null,
  loading: null,
  cache: null,
  cacheStatus: { readable: false, writable: true, note: null },
  watcher: null,
  generation: 0,
  ownWrites: new Map(),
  lastOwnWriteAt: 0,
  locks: new Map(),
});

/** Kulanzfenster, in dem ein eigener Schreibvorgang den Watcher nicht weckt. */
const OWN_WRITE_GRACE_MS = 2_000;

export function markOwnWrite(file: string): void {
  const now = Date.now();
  store.ownWrites.set(file.toLowerCase(), now);
  store.lastOwnWriteAt = now;
}

export function isOwnWrite(file: string): boolean {
  const key = file.toLowerCase();
  const at = store.ownWrites.get(key);
  if (at === undefined) return false;
  if (Date.now() - at > OWN_WRITE_GRACE_MS) {
    store.ownWrites.delete(key);
    return false;
  }
  return true;
}

/** Alte Einträge wegräumen, damit die Karte nicht unbegrenzt wächst. */
export function pruneOwnWrites(): void {
  const now = Date.now();
  for (const [key, at] of store.ownWrites) {
    if (now - at > OWN_WRITE_GRACE_MS) store.ownWrites.delete(key);
  }
}

/**
 * Führt `fn` unter der Schreibsperre des Beitrags aus. Aufrufe auf denselben
 * Slug werden serialisiert, Aufrufe auf verschiedene laufen parallel.
 */
export async function withItemLock<T>(
  slug: Slug,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = store.locks.get(slug) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Die Kette selbst muss gemerkt werden, nicht das Tor: nur so lässt sich
  // unten erkennen, ob seither jemand anderes angestellt hat.
  const chain = previous.then(() => gate);
  store.locks.set(slug, chain);

  try {
    await previous.catch(() => {});
    return await fn();
  } finally {
    release();
    if (store.locks.get(slug) === chain) store.locks.delete(slug);
  }
}
