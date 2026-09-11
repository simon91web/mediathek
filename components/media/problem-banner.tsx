import { AlertTriangle } from "lucide-react";

import type { ItemProblem } from "@/lib/library/types";
import { plural } from "@/lib/utils";

/**
 * Hinweise zu einem Beitrag, freundlich formuliert.
 *
 * Wichtig: ein Beitrag mit kaputtem Kopf bleibt abspielbar — hier steht
 * lediglich, was nicht gelesen werden konnte, statt eine Fehlerseite zu
 * zeigen.
 */
export function ProblemBanner({
  problems,
  betreff = "zu diesem Beitrag",
}: {
  problems: ItemProblem[];
  /** Worauf sich die Hinweise beziehen — auch Themen und Fragen nutzen ihn. */
  betreff?: string;
}) {
  if (problems.length === 0) return null;

  return (
    <details className="rounded-xl border border-warnung/40 bg-warnung-grund px-4 py-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-warnung">
        <AlertTriangle aria-hidden className="size-4 shrink-0" />
        {plural(problems.length, "Hinweis", "Hinweise")} {betreff}
      </summary>
      <ul className="mt-2 space-y-1.5 text-sm text-warnung">
        {problems.map((problem, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden className="text-warnung/60">
              ·
            </span>
            <span>
              {problem.message}
              {problem.line ? (
                <span className="text-warnung/70"> (Zeile {problem.line})</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
