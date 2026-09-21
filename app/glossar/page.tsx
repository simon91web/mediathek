import type { Metadata } from "next";
import Link from "next/link";

import { NeuerBegriff } from "@/components/glossar/neuer-begriff";
import { Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";

export const metadata: Metadata = { title: "Glossar" };

/** Erstes Zeichen, ohne Rücksicht auf Groß-/Kleinschreibung — für die Gruppierung. */
function firstLetter(begriff: string): string {
  const zeichen = begriff.trim().charAt(0).toUpperCase();
  return /[A-ZÄÖÜ]/.test(zeichen) ? zeichen : "#";
}

export default async function GlossarPage() {
  const [library, features] = await Promise.all([getLibrary(), getFeatures()]);

  const gruppen = new Map<string, typeof library.glossary>();
  for (const entry of library.glossary) {
    const buchstabe = firstLetter(entry.begriff);
    const liste = gruppen.get(buchstabe);
    if (liste) liste.push(entry);
    else gruppen.set(buchstabe, [entry]);
  }
  const buchstaben = [...gruppen.keys()].sort((a, b) => a.localeCompare(b, "de"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Glossar</h1>
          <p className="mt-1 text-sm text-schrift-2">
            Fachbegriffe und Eigennamen aus der Bibliothek — jeder Begriff
            zeigt, wo er vorkommt.
          </p>
        </div>
        {features.authorMode ? <NeuerBegriff /> : null}
      </div>

      {library.glossary.length === 0 ? (
        <Leer titel="Noch keine Begriffe">
          Ein Begriff ist eine kleine Datei in{" "}
          <code className="rounded bg-grund-3 px-1">glossar/</code> mit einer
          kanonischen Schreibweise und einer kurzen Definition. Claude Code
          legt sie über die Aufgabe „Glossar sammeln“ an, oder im
          Autorenmodus über den Knopf oben.
        </Leer>
      ) : (
        <div className="flex flex-col gap-5">
          {buchstaben.map((buchstabe) => (
            <div key={buchstabe}>
              <p className="mb-2.5 text-xs font-semibold tracking-wide text-schrift-3 uppercase">
                {buchstabe}
              </p>
              <div className="flex flex-wrap gap-2">
                {gruppen.get(buchstabe)!.map((entry) => (
                  <Link
                    key={entry.slug}
                    href={`/glossar/${entry.slug}`}
                    className="rounded-lg border border-rand bg-grund-2 px-3 py-1.5 text-sm transition-colors hover:border-akzent/50 hover:bg-grund-3"
                  >
                    {entry.begriff}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
