import Link from "next/link";

import { ContinueWatching } from "@/components/media/continue-watching";
import { ItemCard } from "@/components/media/item-card";
import { Leer, SectionTitle } from "@/components/ui/basis";
import { getLibrary } from "@/lib/library";
import { plural } from "@/lib/utils";

export default async function StartPage() {
  const library = await getLibrary();
  const newest = library.items.slice(0, 8);

  return (
    <div className="space-y-10">
      {library.items.length === 0 ? (
        <Leer titel="Die Bibliothek ist noch leer">
          Ziehe ein Video, ein Sprachmemo oder eine Markdown-Datei in die
          Mediathek — oder lege von Hand einen Ordner unter{" "}
          <code className="rounded bg-grund-3 px-1">medien/</code> an. Unter{" "}
          <Link href="/einstellungen" className="text-akzent underline">
            Einstellungen
          </Link>{" "}
          steht, welcher Ordner gerade gelesen wird.
        </Leer>
      ) : null}

      <ContinueWatching items={library.items} />

      {newest.length > 0 ? (
        <section>
          <SectionTitle
            hint={
              library.items.length > newest.length ? (
                <Link href="/medien" className="hover:text-akzent">
                  alle {plural(library.items.length, "Beitrag", "Beiträge")} →
                </Link>
              ) : null
            }
          >
            Neu in der Mediathek
          </SectionTitle>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {newest.map((item) => (
              <li key={item.slug}>
                <ItemCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {library.courses.length > 0 ? (
        <section>
          <SectionTitle
            hint={
              <Link href="/kurse" className="hover:text-akzent">
                alle Kurse →
              </Link>
            }
          >
            Kurse
          </SectionTitle>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {library.courses.slice(0, 6).map((course) => (
              <li key={course.slug}>
                <Link
                  href={`/kurse/${course.slug}`}
                  className="block rounded-xl border border-rand bg-grund-2 p-4 transition-colors hover:border-akzent/50"
                >
                  <p className="font-medium">{course.title}</p>
                  <p className="mt-1 text-xs text-schrift-2">
                    {plural(
                      course.itemSlugs.length - course.missingSlugs.length,
                      "Teil",
                      "Teile",
                    )}
                  </p>
                  {course.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-schrift-2">
                      {course.description}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
