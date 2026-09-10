"use client";

import { useMemo, useSyncExternalStore } from "react";

import { ItemCard } from "@/components/media/item-card";
import { SectionTitle } from "@/components/ui/basis";
import type { Item } from "@/lib/library/types";
import { clearProgress, listProgress, progressKey } from "@/lib/watch-progress";

/** Nichts abonnieren: die Liste ändert sich nicht, während die Seite steht. */
const noopSubscribe = () => () => {};
const getKey = () => progressKey({ limit: 12 });

/**
 * Die Reihe "Weiterschauen".
 *
 * Auf dem Server kommt ein leerer Schlüssel — die Positionen liegen im
 * localStorage des Zuschauers. Dadurch rendert die Reihe serverseitig nichts
 * und füllt sich beim Hydrieren, ohne zweite Renderrunde.
 */
export function ContinueWatching({ items }: { items: Item[] }) {
  const key = useSyncExternalStore(noopSubscribe, getKey, () => "");

  const entries = useMemo(() => {
    if (!key) return [];
    const bySlug = new Map(items.map((item) => [item.slug, item]));
    const found: Array<{ item: Item; position: number }> = [];

    for (const entry of listProgress({ limit: 12 })) {
      const item = bySlug.get(entry.slug);
      if (!item) {
        // Ein Beitrag, den es nicht mehr gibt, wird still vergessen.
        clearProgress(entry.slug);
        continue;
      }
      found.push({ item, position: entry.position });
      if (found.length === 4) break;
    }
    return found;
    // `key` ist die Änderungskennung des Speichers und gehört deshalb dazu.
  }, [key, items]);

  if (entries.length === 0) return null;

  return (
    <section>
      <SectionTitle>Weiterschauen</SectionTitle>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {entries.map(({ item, position }) => (
          <li key={item.slug}>
            <ItemCard item={item} resumeAt={position} />
          </li>
        ))}
      </ul>
    </section>
  );
}
