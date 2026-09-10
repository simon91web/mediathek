"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Das Suchfeld.
 *
 * Schickt ab, statt bei jedem Tastendruck zu suchen: die Trefferliste kommt
 * serverseitig gerendert, damit ein Suchergebnis auch ein teilbarer Link
 * ist. Für ein Vorschlagsfeld während des Tippens ist später Platz.
 */
export function SearchBox({
  initialQuery = "",
  autoFocus = false,
  compact = false,
}: {
  initialQuery?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  /*
   * Der Anfangswert wird nur beim Mounten übernommen. Damit das Feld nach
   * einer neuen Suche den neuen Begriff zeigt, gibt die Suchseite ein `key`
   * mit — das ist der von React vorgesehene Weg, Zustand an eine
   * Eigenschaft zu binden. Ein Effect, der setState ruft, wäre eine zweite
   * Renderrunde bei jedem Tastendruck der Elternkomponente.
   */
  const [query, setQuery] = useState(initialQuery);
  const input = useRef<HTMLInputElement>(null);

  // Schrägstrich springt ins Suchfeld — wie in vielen Werkzeugen.
  useEffect(() => {
    if (compact) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      ) {
        return;
      }
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [compact]);

  const submit = () => {
    const trimmed = query.trim();
    router.push(trimmed ? `/suche?q=${encodeURIComponent(trimmed)}` : "/suche");
  };

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn("relative", compact ? "w-44 lg:w-64" : "w-full")}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-schrift-3"
      />
      <input
        ref={input}
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={compact ? "Suchen …" : "Wonach suchst du?"}
        aria-label="In der Mediathek suchen"
        className={cn(
          "w-full rounded-lg border border-rand bg-grund pl-8 text-sm",
          "placeholder:text-schrift-3 focus:border-akzent",
          compact ? "h-8 pr-2" : "h-11 pr-3",
        )}
      />
    </form>
  );
}
