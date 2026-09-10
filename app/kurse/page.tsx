import type { Metadata } from "next";
import Link from "next/link";

import { Leer } from "@/components/ui/basis";
import { getLibrary } from "@/lib/library";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Kurse" };

export default async function KursePage() {
  const library = await getLibrary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kurse</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Ein Kurs bündelt Beiträge in einer Reihenfolge — quer über Videos,
          Sprachmemos und Texte.
        </p>
      </div>

      {library.courses.length === 0 ? (
        <Leer titel="Noch keine Kurse">
          Ein Kurs ist eine kleine Datei in{" "}
          <code className="rounded bg-grund-3 px-1">kurse/</code> mit einem
          Titel und den Verweisen auf die Beiträge — die Reihenfolge der
          Verweise ist die Kursreihenfolge.
        </Leer>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {library.courses.map((course) => {
            const vorhanden =
              course.itemSlugs.length - course.missingSlugs.length;
            return (
              <li key={course.slug}>
                <Link
                  href={`/kurse/${course.slug}`}
                  className="flex h-full flex-col rounded-xl border border-rand bg-grund-2 p-4 transition-colors hover:border-akzent/50"
                >
                  <p className="font-medium">{course.title}</p>
                  <p className="mt-1 text-xs text-schrift-2">
                    {plural(vorhanden, "Teil", "Teile")}
                    {course.missingSlugs.length > 0 ? (
                      <span className="text-warnung">
                        {" "}
                        · {course.missingSlugs.length} fehlen
                      </span>
                    ) : null}
                  </p>
                  {course.description ? (
                    <p className="mt-2 line-clamp-3 text-sm text-schrift-2">
                      {course.description}
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
