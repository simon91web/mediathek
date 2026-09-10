import { getLibrary } from "@/lib/library";

/*
 * Der Puls der Bibliothek. Der Client fragt das im Hintergrund ab und lädt
 * die Seite neu, sobald die Kennzahl steigt — so erscheinen Kapitel, die
 * Claude Code eingetragen hat, ohne Serverneustart und ohne Zutun.
 *
 * Abfragen statt SSE, und das mit Absicht: ein lokaler Server, ein Nutzer,
 * und eine offene Verbindung übersteht den Hot-Reload im Entwicklungsbetrieb
 * nicht sauber. Das spart eine ganze Fehlerklasse. Für den Fortschritt eines
 * Transkriptionslaufs (Etappe 2) ist SSE die richtige Wahl — der läuft
 * minutenlang, das hier ist eine Zahl.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const library = await getLibrary();

  return Response.json(
    {
      generation: library.generation,
      scannedAtMs: library.scannedAtMs,
      scanDurationMs: library.scanDurationMs,
      items: library.items.length,
      courses: library.courses.length,
      problems: library.problems.length,
      watch: library.watch,
      cache: library.cache,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
