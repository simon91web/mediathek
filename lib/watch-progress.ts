/*
 * Wo der Zuschauer stehengeblieben ist. Bewusst nur im Browser: Zuschauer
 * schreiben NIE in die Bibliothek — der Ordner liegt womöglich
 * schreibgeschützt auf einem Netzlaufwerk und wird von mehreren Leuten
 * gelesen.
 *
 * Kein Lernfortschritt, keine Statistik, nur die Position. Es soll niemand
 * gezwungen sein, etwas anzusehen.
 */

const KEY = "mediathek:fortschritt:v1";
const MAX_ENTRIES = 200;

export type WatchProgress = {
  slug: string;
  /** Sekunden bei Video und Audio, Scrollanteil (0..1) bei Text. */
  position: number;
  durationSeconds: number | null;
  updatedAtMs: number;
};

type Store = Record<string, WatchProgress>;

/** Der Speicher wird übergeben, damit die Regeln ohne Browser testbar sind. */
function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Privates Fenster oder gesperrte Website-Daten: dann eben ohne.
    return null;
  }
}

function read(storage?: Storage): Store {
  const target = getStorage(storage);
  if (!target) return {};
  try {
    const raw = target.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Store;
  } catch {
    // Kaputtes JSON verwerfen, nicht werfen.
    return {};
  }
}

function write(store: Store, storage?: Storage): void {
  const target = getStorage(storage);
  if (!target) return;
  try {
    target.setItem(KEY, JSON.stringify(store));
  } catch {
    // Speicher voll oder gesperrt: der Verlust ist verkraftbar.
  }
}

/**
 * Unter zehn Sekunden ist noch kein Fortschritt, über 95 Prozent ist der
 * Beitrag zu Ende — beides wird nicht gemerkt. Genau wie bei YouTube, und
 * genau deshalb, weil "Weiterschauen" sonst mit Fertigem zuläuft.
 */
export function shouldRemember(
  position: number,
  durationSeconds: number | null,
): boolean {
  if (!Number.isFinite(position) || position < 10) return false;
  if (durationSeconds && durationSeconds > 0) {
    return position < durationSeconds * 0.95;
  }
  return true;
}

export function readProgress(
  slug: string,
  storage?: Storage,
): WatchProgress | null {
  return read(storage)[slug] ?? null;
}

export function writeProgress(entry: WatchProgress, storage?: Storage): void {
  const store = read(storage);
  store[entry.slug] = entry;

  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    // Die ältesten fallen heraus.
    keys
      .sort((a, b) => store[a].updatedAtMs - store[b].updatedAtMs)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((key) => delete store[key]);
  }
  write(store, storage);
}

export function clearProgress(slug?: string, storage?: Storage): void {
  if (!slug) {
    write({}, storage);
    return;
  }
  const store = read(storage);
  delete store[slug];
  write(store, storage);
}

/** Für die Reihe "Weiterschauen": das Zuletzt-Angesehene zuerst. */
export function listProgress(
  options: { limit?: number } = {},
  storage?: Storage,
): WatchProgress[] {
  const entries = Object.values(read(storage)).sort(
    (a, b) => b.updatedAtMs - a.updatedAtMs,
  );
  return options.limit ? entries.slice(0, options.limit) : entries;
}

/*
 * Die beiden Funktionen darunter liefern VERGLEICHBARE Werte (eine Zahl, eine
 * Zeichenkette) statt Objekte.
 *
 * Das ist Absicht: die Komponenten lesen sie über useSyncExternalStore, und
 * dessen getSnapshot muss bei unverändertem Zustand denselben Wert liefern —
 * ein jedes Mal neu gebautes Objekt oder Array ergäbe eine Endlosschleife.
 * Der Umweg über useEffect plus setState wäre die naheliegende, aber falsche
 * Lösung: er erzeugt eine zweite Renderrunde bei jeder Kachel.
 */

/** Anteil des Angesehenen, oder null wenn nichts gemerkt ist. */
export function progressRatio(
  slug: string,
  durationSeconds: number | null,
  storage?: Storage,
): number | null {
  const entry = read(storage)[slug];
  if (!entry) return null;
  const total = durationSeconds ?? entry.durationSeconds;
  if (!total || total <= 0) return null;
  return Math.min(1, Math.max(0, entry.position / total));
}

/**
 * Ein stabiler Schlüssel über alle gemerkten Positionen. Ändert sich genau
 * dann, wenn sich etwas geändert hat — und taugt damit als Snapshot.
 */
export function progressKey(options: { limit?: number } = {}, storage?: Storage): string {
  return listProgress(options, storage)
    .map((entry) => `${entry.slug}:${Math.round(entry.position)}`)
    .join("|");
}
