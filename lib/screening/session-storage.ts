import type { ScreeningCandidate } from "./types";

/*
 * Der Stand einer Sichtung, nur im Browser — damit "einen Ordner sichten,
 * währenddessen woanders auf der Plattform etwas anderes machen" nicht die
 * Liste verliert. Die eigentliche Arbeit läuft ohnehin serverseitig in der
 * Job-Queue weiter, unabhängig von dieser Seite; hier geht es nur darum,
 * beim Zurückkommen nicht neu tippen und neu scannen zu müssen.
 *
 * Bewusst nur im Browser, wie bei watch-progress.ts: das ist kein
 * Bibliotheksinhalt, nur eine Erinnerung für diese Maschine.
 *
 * Gelesen wird die rohe Zeichenkette (vergleichbar über ===), NIE ein frisch
 * geparstes Objekt — sonst hielte useSyncExternalStore jede Runde für eine
 * Änderung. Geparst wird erst dahinter, in einem useMemo.
 */

const KEY = "mediathek:sichtung:sitzung:v1";

export type ScreeningSession = {
  pfad: string;
  candidates: ScreeningCandidate[];
  selected: string[];
};

function getStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Die rohe Zeichenkette — der Snapshot für useSyncExternalStore. */
export function readSessionRaw(storage?: Storage): string | null {
  const target = getStorage(storage);
  if (!target) return null;
  try {
    return target.getItem(KEY);
  } catch {
    return null;
  }
}

/** Wandelt die rohe Zeichenkette in eine Sitzung um — oder null bei Unsinn. */
export function parseSession(raw: string | null): ScreeningSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as ScreeningSession).candidates)
    ) {
      return null;
    }
    return parsed as ScreeningSession;
  } catch {
    return null;
  }
}

export function writeSession(
  session: ScreeningSession | null,
  storage?: Storage,
): void {
  const target = getStorage(storage);
  if (!target) return;
  try {
    if (session) target.setItem(KEY, JSON.stringify(session));
    else target.removeItem(KEY);
  } catch {
    // Speicher voll oder gesperrt: der Verlust ist verkraftbar.
  }
}
