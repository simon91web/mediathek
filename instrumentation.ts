/*
 * Läuft einmal beim Start des Servers.
 *
 * Zwei Aufgaben: die Bibliothek einlesen und den Verzeichnis-Beobachter
 * starten, damit Änderungen von außen (Editor, Claude Code, Explorer) ohne
 * Serverneustart ankommen.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getLibrary } = await import("@/lib/library");
  const { applyStoredLibraryDir } = await import(
    "@/lib/library/library-dir"
  );
  const { attachWatcher } = await import("@/lib/library/attach");

  /*
   * ZUERST der Ordner, dann alles andere: der gemerkte Pfad aus den
   * Einstellungen muss stehen, bevor der erste Scan losläuft — sonst liest
   * er die Entwicklungsbibliothek und der Beobachter bewacht den falschen
   * Ordner.
   */
  await applyStoredLibraryDir();

  /*
   * Steht noch nicht fest, WO die Bibliothek liegt, wird nicht gescannt.
   *
   * Nachgemessen am gepackten Programm: sonst läuft der Scan gegen den
   * eingebauten Standard — also gegen `<Programmordner>/bibliothek-dev` —
   * und legt dort beim Schreiben des Zwischenspeichers einen Ordner an. Das
   * Programm hätte sich damit selbst eine Bibliothek erfunden, an einer
   * Stelle, die beim nächsten Update verschwindet.
   */
  const { firstRunState } = await import("@/lib/library/first-run");
  if ((await firstRunState()).needed) {
    console.log(
      "[bibliothek] Noch kein Ordner gewählt — der Begrüßungsschirm fragt danach.",
    );
    return;
  }

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

  attachWatcher();
}
