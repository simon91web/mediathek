import "server-only";

import { hasUnfinishedJobs, resetJobs } from "@/lib/jobs";
import {
  defaultLibraryRoot,
  LIBRARY_DIR_FIXED,
  libraryRoot,
  setLibraryRoot,
} from "@/lib/paths";
import { invalidateSearchIndex } from "@/lib/search";
import { writeSettings } from "@/lib/settings";
import { attachWatcher } from "./attach";
import { reloadLibrary } from "./index";
import { checkLibraryDir } from "./library-dir";
import { store } from "./store";
import { invalidateTranscripts } from "./transcript";

/*
 * Die Bibliothek im laufenden Betrieb wechseln.
 *
 * Ein anderer Ordner ist mehr als ein Pfad: Index, Verzeichnis-Beobachter,
 * Suchindex, Transkript-Zwischenspeicher und der Verlauf der
 * Auftragsschlange gehören alle zur ALTEN Bibliothek. Bleibt eines davon
 * stehen, zeigt die Mediathek eine Mischung aus zwei Beständen — und das
 * merkt man erst, wenn man einem Verweis folgt, dessen Ziel es hier nie gab.
 *
 * Deshalb ist das eine Funktion und nicht ein setLibraryRoot am Aufrufort.
 */

export type SwitchResult =
  | {
      ok: true;
      dir: string;
      items: number;
      /** true, wenn der Ordner noch keinen medien/-Ordner hat. */
      fresh: boolean;
      /** true, wenn auf den Standard zurückgestellt wurde. */
      reset: boolean;
      /** Gesetzt, wenn der Wechsel gilt, aber nicht gemerkt werden konnte. */
      note: string | null;
    }
  | { ok: false; error: string };

/**
 * Wechselt auf `input`. `null` stellt auf den Standard zurück — also auf
 * MEDIATHEK_LIBRARY_DIR, sonst ./bibliothek-dev.
 */
export async function switchLibrary(
  input: string | null,
): Promise<SwitchResult> {
  if (LIBRARY_DIR_FIXED) {
    return {
      ok: false,
      error:
        "Der Ordner ist über die Umgebungsvariable MEDIATHEK_LIBRARY_DIR " +
        "festgelegt und lässt sich hier nicht umstellen. So ist das " +
        "weitergegebene Viewer-Paket eingerichtet.",
    };
  }

  /*
   * Ein laufender Auftrag arbeitet mit absoluten Pfaden in die ALTE
   * Bibliothek und schreibt sein Ergebnis dorthin. Ihn mitten im Wechsel
   * weiterlaufen zu lassen ergäbe ein Transkript, das niemand mehr sieht.
   */
  if (await hasUnfinishedJobs()) {
    return {
      ok: false,
      error:
        "Es läuft noch ein Auftrag. Erst abwarten oder abbrechen — sonst " +
        "landet sein Ergebnis in der alten Bibliothek.",
    };
  }

  const reset = input === null || input.trim() === "";
  let target: string;
  let fresh = false;

  if (reset) {
    target = defaultLibraryRoot();
  } else {
    const check = await checkLibraryDir(input!);
    if (!check.ok) return { ok: false, error: check.error };
    target = check.dir;
    fresh = check.fresh;
  }

  const before = libraryRoot();

  /*
   * Einen laufenden Scan abwarten, NICHT verwerfen: sein .then() setzt
   * store.state — käme es nach dem Wechsel, stünde dort der alte Bestand
   * unter dem neuen Ordner.
   */
  if (store.loading) await store.loading.catch(() => {});

  store.watcher?.close();
  store.watcher = null;
  store.state = null;
  store.loading = null;
  store.cache = null;
  store.cacheStatus = { readable: false, writable: true, note: null };
  store.ownWrites.clear();
  store.lastOwnWriteAt = 0;
  /*
   * store.generation wird NICHT zurückgesetzt: der Client pollt darauf und
   * erkennt eine Änderung nur an einer höheren Zahl. Ein Rücksprung auf 0
   * hieße für ihn "nichts passiert" — beim Wechsel der ganzen Bibliothek der
   * denkbar schlechteste Moment.
   */

  setLibraryRoot(target);
  resetJobs();
  invalidateTranscripts();
  invalidateSearchIndex();

  // Erst umstellen, dann merken: was nicht gelesen werden kann, wird nicht gemerkt.
  const written = await writeSettings({ lastLibraryDir: reset ? null : target });

  let items = 0;
  try {
    const result = await reloadLibrary({ force: true });
    items = result.items;
  } catch (error) {
    /*
     * Der neue Ordner ließ sich doch nicht lesen (Freigabe gerade weg,
     * Berechtigung anders als beim Prüfen). Zurück auf den alten, damit die
     * Mediathek benutzbar bleibt statt leer zu stehen.
     */
    setLibraryRoot(before);
    await writeSettings({
      lastLibraryDir: before === defaultLibraryRoot() ? null : before,
    });
    await reloadLibrary({ force: true }).catch(() => {});
    attachWatcher();
    return {
      ok: false,
      error:
        `Der Ordner ließ sich nicht einlesen: ${
          error instanceof Error ? error.message : String(error)
        } — es gilt weiter ${before}.`,
    };
  }

  attachWatcher();
  console.log(`[bibliothek] Ordner gewechselt: ${before} → ${target}`);

  return {
    ok: true,
    dir: target,
    items,
    fresh,
    reset,
    /*
     * Der Wechsel gilt trotzdem — nur überlebt er den nächsten Serverstart
     * nicht. Das muss dastehen, sonst sitzt man morgen wieder vor dem alten
     * Ordner und sucht den Fehler in der Bibliothek.
     */
    note: written.ok
      ? null
      : `Der Ordner gilt, ließ sich aber nicht merken (${written.error}) — ` +
        "nach einem Neustart des Servers gilt wieder der alte.",
  };
}
