import type { Metadata } from "next";
import Link from "next/link";

import { ItemCard } from "@/components/media/item-card";
import { Leer } from "@/components/ui/basis";
import { getLibrary, listItems } from "@/lib/library";
import type { MediaKind } from "@/lib/library/types";
import { cn, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Mediathek" };

const KIND_FILTERS = [
  { value: null, label: "Alles" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Sprachmemos" },
  { value: "text", label: "Texte" },
] as const;

const SORT_OPTIONS = [
  { value: "neu", label: "Neueste" },
  { value: "titel", label: "Titel" },
  { value: "dauer", label: "Länge" },
] as const;

type Search = {
  art?: string;
  schlagwort?: string | string[];
  sortierung?: string;
};

function toKinds(art: string | undefined): MediaKind[] | undefined {
  if (art === "video" || art === "audio" || art === "text") return [art];
  return undefined;
}

function toTags(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

/** Baut eine Adresse, die die übrigen Filter beibehält. */
function buildHref(
  current: Search,
  change: Partial<Record<"art" | "sortierung", string | null>> & {
    toggleTag?: string;
  },
): string {
  const params = new URLSearchParams();
  const art = change.art !== undefined ? change.art : current.art;
  if (art) params.set("art", art);

  const sort =
    change.sortierung !== undefined ? change.sortierung : current.sortierung;
  if (sort && sort !== "neu") params.set("sortierung", sort);

  let tags = toTags(current.schlagwort);
  if (change.toggleTag) {
    tags = tags.includes(change.toggleTag)
      ? tags.filter((tag) => tag !== change.toggleTag)
      : [...tags, change.toggleTag];
  }
  for (const tag of tags) params.append("schlagwort", tag);

  const query = params.toString();
  return query ? `/medien?${query}` : "/medien";
}

export default async function MedienPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const library = await getLibrary();
  const activeTags = toTags(search.schlagwort);
  const sort =
    search.sortierung === "titel" || search.sortierung === "dauer"
      ? search.sortierung
      : "neu";

  const { items, total } = await listItems({
    kinds: toKinds(search.art),
    tags: activeTags,
    sort,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mediathek</h1>
        <p className="text-sm text-schrift-2">
          {total === library.items.length
            ? plural(total, "Beitrag", "Beiträge")
            : `${total} von ${library.items.length} Beiträgen`}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FilterGroup label="Art">
            {KIND_FILTERS.map((filter) => (
              <FilterLink
                key={filter.label}
                href={buildHref(search, { art: filter.value })}
                active={(search.art ?? null) === filter.value}
              >
                {filter.label}
              </FilterLink>
            ))}
          </FilterGroup>

          <FilterGroup label="Sortierung">
            {SORT_OPTIONS.map((option) => (
              <FilterLink
                key={option.value}
                href={buildHref(search, { sortierung: option.value })}
                active={sort === option.value}
              >
                {option.label}
              </FilterLink>
            ))}
          </FilterGroup>
        </div>

        {library.tags.length > 0 ? (
          <FilterGroup label="Schlagworte">
            {library.tags.map((entry) => (
              <FilterLink
                key={entry.tag}
                href={buildHref(search, { toggleTag: entry.tag })}
                active={activeTags.includes(entry.tag)}
              >
                {entry.tag}
                <span className="ml-1 text-schrift-3">{entry.count}</span>
              </FilterLink>
            ))}
          </FilterGroup>
        ) : null}
      </div>

      {items.length === 0 ? (
        <Leer titel="Keine Beiträge gefunden">
          {library.items.length === 0
            ? "Die Bibliothek ist noch leer. Lege einen Ordner unter " +
              "medien/ an oder ziehe eine Datei in die Mediathek."
            : "Mit diesen Filtern passt nichts zusammen. Nimm einen Filter zurück."}
        </Leer>
      ) : (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.slug}>
              <ItemCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-xs tracking-wide text-schrift-3 uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors",
        active
          ? "border-akzent bg-akzent/10 font-medium text-akzent"
          : "border-rand text-schrift-2 hover:bg-grund-2 hover:text-schrift",
      )}
    >
      {children}
    </Link>
  );
}
