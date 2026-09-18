"use client";

import { useState, useTransition } from "react";
import { Wand2 } from "lucide-react";

import { startChainAction } from "@/app/medien/[slug]/actions";
import { Button } from "@/components/ui/basis";
import { KIND_LABEL } from "@/lib/jobs/types";
import type { ChainResult } from "@/lib/jobs/chain";

/*
 * Ein Knopf für den ganzen Weg: Transkription → Kapitel → Suche → Bezüge.
 *
 * Vorher waren das vier Knöpfe an drei Stellen, zwischen denen man warten und
 * nachsehen musste, ob der vorige fertig ist. Die Schlange arbeitet ohnehin
 * seriell — sie kann diese Reihenfolge selbst einhalten.
 *
 * Gemeldet wird, was tatsächlich angestellt wurde UND was nicht. Gerade das
 * Zweite ist wichtig: „nichts passiert" ist die schlechteste Antwort, die ein
 * Knopf geben kann, und ohne Werkzeug oder ohne eingeschaltete KI-Schritte
 * passiert hier genau das.
 */

export function ChainButton({
  slug,
  label = "Alles erschließen",
}: {
  slug: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ChainResult | null>(null);

  const angestellt =
    result?.steps.filter((step) => step.state === "angestellt") ?? [];
  const fehlt = result?.steps.filter((s) => s.state === "fehlt-werkzeug") ?? [];

  return (
    <div className="space-y-2" data-tour="kette">
      <Button
        variant="primaer"
        size="klein"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            setResult(await startChainAction(slug));
          });
        }}
      >
        <Wand2 aria-hidden className="size-3.5" />
        {pending ? "Wird angestellt …" : label}
      </Button>

      {result ? (
        <div className="space-y-1 text-xs">
          {result.error ? (
            <p className="text-warnung">{result.error}</p>
          ) : angestellt.length > 0 ? (
            <p className="text-akzent">
              In der Schlange:{" "}
              {angestellt.map((step) => KIND_LABEL[step.kind]).join(" → ")}. Der
              Fortschritt steht bei den Aufträgen.
            </p>
          ) : (
            <p className="text-schrift-2">
              Nichts anzustellen — an diesem Beitrag ist schon alles getan.
            </p>
          )}

          {fehlt.map((step) => (
            <p key={step.kind} className="text-warnung">
              {KIND_LABEL[step.kind]} übersprungen: {step.note}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
