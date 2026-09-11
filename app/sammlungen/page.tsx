import type { Metadata } from "next";
import Link from "next/link";
import { ListOrdered, Search } from "lucide-react";

import { NewCollectionForm } from "@/components/library/new-collection-form";
import { Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Sammlungen" };

export default async function SammlungenPage() {
  const [library, features] = await Promise.all([getLibrary(), getFeatures()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sammlungen</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Ein Weg durch Ausschnitte, quer über die Beiträge — oder eine
          gespeicherte Suche, die bei jedem Aufruf neu läuft.
        </p>
      </div>

      {features.authorMode ? <NewCollectionForm /> : null}

      {library.collections.length === 0 ? (
        <Leer titel="Noch keine Sammlungen">
          Eine Sammlung ist eine Datei in{" "}
          <code className="rounded bg-grund-3 px-1">sammlungen/</code> mit
          Zeilen wie{" "}
          <code className="rounded bg-grund-3 px-1">
            [[akku-grundlagen#00:15-00:50]] Messen mit dem Zellprüfer
          </code>
          . Steht stattdessen{" "}
          <code className="rounded bg-grund-3 px-1">suche:</code> im Kopf, wird
          sie zur gespeicherten Suche.
        </Leer>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {library.collections.map((collection) => (
            <li key={collection.slug}>
              <Link
                href={`/sammlungen/${collection.slug}`}
                className="flex h-full flex-col rounded-xl border border-rand bg-grund-2 p-4 transition-colors hover:border-akzent/50"
              >
                <p className="flex items-center gap-1.5 font-medium">
                  {collection.query ? (
                    <Search
                      aria-hidden
                      className="size-3.5 shrink-0 text-schrift-3"
                    />
                  ) : (
                    <ListOrdered
                      aria-hidden
                      className="size-3.5 shrink-0 text-schrift-3"
                    />
                  )}
                  {collection.title}
                </p>
                <p className="mt-1 text-xs text-schrift-2">
                  {collection.query
                    ? `Gespeicherte Suche: „${collection.query}“`
                    : plural(
                        collection.entries.length,
                        "Ausschnitt",
                        "Ausschnitte",
                      )}
                  {collection.missingSlugs.length > 0 ? (
                    <span className="text-warnung">
                      {" "}
                      · {collection.missingSlugs.length} ohne Ziel
                    </span>
                  ) : null}
                </p>
                {collection.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-schrift-2">
                    {collection.description}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
