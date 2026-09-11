"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BookmarkPlus } from "lucide-react";

import { saveSearchAction } from "@/app/sammlungen/actions";
import { Button } from "@/components/ui/basis";

/*
 * „Diese Suche merken" — aus der laufenden Anfrage wird eine Sammlung.
 *
 * Der Moment ist genau richtig: man hat eben eine Anfrage gefunden, die
 * etwas Brauchbares zutage fördert. Danach wieder eine Datei von Hand
 * anzulegen, ist die Stelle, an der es liegen bleibt.
 *
 * Gemerkt wird die ANFRAGE, nicht die Treffer. Kommt später ein Beitrag
 * dazu, steht er von selbst mit drin.
 */

export function SaveSearch({ query }: { query: string }) {
  const [offen, setOffen] = useState(false);
  const [titel, setTitel] = useState(query);
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<{ slug: string; text: string } | null>(
    null,
  );

  if (fertig) {
    return (
      <p className="text-xs text-akzent">
        {fertig.text}{" "}
        <Link
          href={`/sammlungen/${fertig.slug}`}
          className="underline underline-offset-2"
        >
          Öffnen
        </Link>
      </p>
    );
  }

  if (!offen) {
    return (
      <Button size="klein" variant="leise" onClick={() => setOffen(true)}>
        <BookmarkPlus aria-hidden className="size-3.5" />
        Diese Suche merken
      </Button>
    );
  }

  const absenden = () => {
    setFehler(null);
    startTransition(async () => {
      const result = await saveSearchAction({ title: titel, query });
      if (!result.ok) {
        setFehler(result.error);
        return;
      }
      setFertig({ slug: result.slug, text: result.message });
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={titel}
          autoFocus
          disabled={pending}
          aria-label="Titel der Sammlung"
          onChange={(event) => setTitel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") absenden();
            if (event.key === "Escape") setOffen(false);
          }}
          className="h-8 w-56 rounded-lg border border-rand bg-grund-2 px-2 text-sm disabled:opacity-50"
        />
        <Button
          size="klein"
          variant="primaer"
          disabled={pending || !titel.trim()}
          onClick={absenden}
        >
          {pending ? "Merkt …" : "Merken"}
        </Button>
        <Button
          size="klein"
          variant="leise"
          disabled={pending}
          onClick={() => setOffen(false)}
        >
          Abbrechen
        </Button>
      </div>
      <p className="text-xs text-schrift-2">
        Gemerkt wird die Anfrage{" "}
        <code className="rounded bg-grund-3 px-1">{query}</code>, nicht die
        heutigen Treffer.
      </p>
      {fehler ? <p className="text-xs text-warnung">{fehler}</p> : null}
    </div>
  );
}
