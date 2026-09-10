import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { MarkdownText } from "@/components/markdown";
import { ItemCard } from "@/components/media/item-card";
import { getCourse, getLibrary } from "@/lib/library";
import { isSlug } from "@/lib/library/slug";
import { plural } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSlug(slug)) return { title: "Nicht gefunden" };
  const course = await getCourse(slug);
  return { title: course?.title ?? "Nicht gefunden" };
}

export default async function KursPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();

  const [course, library] = await Promise.all([getCourse(slug), getLibrary()]);
  if (!course) notFound();

  // Die Reihenfolge der Datei gewinnt — sie ist die Kursreihenfolge.
  const items = course.itemSlugs
    .map((entry) => library.bySlug.get(entry))
    .filter((item): item is NonNullable<typeof item> => item !== undefined);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-wide text-schrift-3 uppercase">Kurs</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {course.title}
        </h1>
        <p className="mt-1 text-sm text-schrift-2">
          {plural(items.length, "Teil", "Teile")}
        </p>
        {course.description ? (
          <div className="prosa mt-3 max-w-prose text-[15px]">
            <MarkdownText>{course.description}</MarkdownText>
          </div>
        ) : null}
      </div>

      {course.missingSlugs.length > 0 ? (
        <p className="flex items-start gap-2 rounded-xl border border-warnung/40 bg-warnung-grund px-4 py-3 text-sm text-warnung">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {course.missingSlugs.length === 1
              ? "Dieser Kurs nennt einen Beitrag, den es nicht gibt: "
              : `Dieser Kurs nennt ${course.missingSlugs.length} Beiträge, die es nicht gibt: `}
            <span className="font-mono text-xs">
              {course.missingSlugs.join(", ")}
            </span>
            . Vermutlich wurde ein Ordner umbenannt.
          </span>
        </p>
      ) : null}

      <ol className="space-y-4">
        {items.map((item, index) => (
          <li key={item.slug} className="flex gap-4">
            <span
              aria-hidden
              className="mt-1 grid size-7 shrink-0 place-items-center rounded-full border border-rand bg-grund-2 text-xs font-medium tabular-nums text-schrift-2"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 sm:max-w-sm">
              <ItemCard item={item} />
            </div>
          </li>
        ))}
      </ol>

      <p className="text-sm">
        <Link href="/kurse" className="text-akzent hover:underline">
          ← Alle Kurse
        </Link>
      </p>
    </div>
  );
}
