import "server-only";

import { reloadLibrary } from "./index";
import { store } from "./store";
import { invalidateTranscripts } from "./transcript";
import { startWatching } from "./watch";

/*
 * Den Verzeichnis-Beobachter anhängen.
 *
 * Eigene Datei, weil es zwei Anlässe gibt: den Serverstart
 * (instrumentation.ts) und den Wechsel der Bibliothek (./switch). Beide
 * brauchen genau dieselbe Behandlung von Änderungen — ein zweiter, leicht
 * abweichender Aufruf wäre die Art Unterschied, die man erst nach Wochen
 * bemerkt.
 */

export function attachWatcher(): void {
  // Ein Hot-Reload oder ein Wechsel darf keinen zweiten Beobachter hinterlassen.
  store.watcher?.close();
  store.watcher = startWatching({
    onChange: (slugs, source) => {
      const list = slugs === "alles" ? null : slugs;
      if (list) invalidateTranscripts(list);
      else invalidateTranscripts();

      void reloadLibrary({ onlySlugs: list })
        .then((result) => {
          const what =
            list === null ? "alles" : list.join(", ") || "keine Änderung";
          console.log(
            `[bibliothek] neu gelesen (${source}): ${what} — ` +
              `${result.items} Beiträge in ${result.durationMs} ms`,
          );
        })
        .catch((error) => {
          console.error("[bibliothek] Neu einlesen fehlgeschlagen:", error);
        });
    },
  });

  console.log(
    `[bibliothek] Beobachter läuft im Modus "${store.watcher.mode}"` +
      (store.watcher.error ? ` (${store.watcher.error})` : ""),
  );
}
