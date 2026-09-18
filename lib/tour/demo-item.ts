import "server-only";

import { getLibrary } from "@/lib/library";

/**
 * Ein Beitrag zum Vorführen der Workflow-Tour.
 *
 * Nach Möglichkeit einer mit Kapiteln — sonst zeigt die Kapitelliste nichts
 * Anschauliches. Fehlt das, tut es der erste Beitrag auch; eine leere
 * Bibliothek liefert null, und die Tour überspringt dann jeden Schritt, der
 * einen Beitrag braucht (dieselbe Regel wie bei jedem anderen fehlenden
 * Ziel).
 */
export async function findTourDemoSlug(): Promise<string | null> {
  const library = await getLibrary();
  const withChapters = library.items.find((item) => item.chapters.length > 0);
  return (withChapters ?? library.items[0])?.slug ?? null;
}
