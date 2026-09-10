import type { Metadata } from "next";
import Link from "next/link";

import { Leer } from "@/components/ui/basis";
import { getLibrary } from "@/lib/library";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Themen" };

export default async function ThemenPage() {
  const library = await getLibrary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Themen</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Ein Thema bündelt Beiträge in einer Reihenfolge — quer über Videos,
          Sprachmemos und Texte.
        </p>
      </div>

      {library.topics.length === 0 ? (
        <Leer titel="Noch keine Themen">
          Ein Thema ist eine kleine Datei in{" "}
          <code className="rounded bg-grund-3 px-1">themen/</code> mit einem
          Titel und den Verweisen auf die Beiträge — die Reihenfolge der
          Verweise ist die Reihenfolge im Thema.
        </Leer>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {library.topics.map((topic) => {
            const vorhanden =
              topic.itemSlugs.length - topic.missingSlugs.length;
            return (
              <li key={topic.slug}>
                <Link
                  href={`/themen/${topic.slug}`}
                  className="flex h-full flex-col rounded-xl border border-rand bg-grund-2 p-4 transition-colors hover:border-akzent/50"
                >
                  <p className="font-medium">{topic.title}</p>
                  <p className="mt-1 text-xs text-schrift-2">
                    {plural(vorhanden, "Teil", "Teile")}
                    {topic.missingSlugs.length > 0 ? (
                      <span className="text-warnung">
                        {" "}
                        · {plural(topic.missingSlugs.length, "fehlt", "fehlen")}
                      </span>
                    ) : null}
                  </p>
                  {topic.description ? (
                    <p className="mt-2 line-clamp-3 text-sm text-schrift-2">
                      {topic.description}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
