/*
 * Läuft einmal beim Start des Servers.
 *
 * Zwei Aufgaben: die Bibliothek einlesen und den Verzeichnis-Beobachter
 * starten, damit Änderungen von außen (Editor, Claude Code, Explorer) ohne
 * Serverneustart ankommen.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getLibrary, reloadLibrary } = await import("@/lib/library");
  const { startWatching } = await import("@/lib/library/watch");
  const { invalidateTranscripts } = await import("@/lib/library/transcript");
  const { store } = await import("@/lib/library/store");

  /*
   * Bewusst NICHT abgewartet: auf einem Netzlaufwerk dauert der erste Scan
   * lange, und die erste Seite soll trotzdem sofort antworten — sie wartet
   * dann in getLibrary() auf dasselbe Versprechen.
   */
  void getLibrary()
    .then((library) => {
      console.log(
        `[bibliothek] ${library.items.length} Beiträge aus ${library.root} ` +
          `in ${library.scanDurationMs} ms`,
      );
      if (library.problems.length > 0) {
        console.warn(
          `[bibliothek] ${library.problems.length} Ordner übersprungen — ` +
            "Einzelheiten stehen unter /einstellungen",
        );
      }
    })
    .catch((error) => {
      console.error("[bibliothek] Erster Scan fehlgeschlagen:", error);
    });

  // Ein Hot-Reload darf keinen zweiten Beobachter hinterlassen.
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
