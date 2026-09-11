"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteQuestionAction } from "@/app/fragen/actions";
import { Button } from "@/components/ui/basis";

/*
 * Eine abgelegte Frage wieder loswerden.
 *
 * Der Gegenpol zum Ablegen ohne Nachfrage: weil jede Frage von selbst in der
 * Bibliothek landet, MUSS das Wegräumen leicht sein — sonst denkt man beim
 * Fragen darüber nach, ob die Frage gut genug ist, und genau das soll man
 * nicht.
 *
 * Gefragt wird trotzdem einmal: es wird eine Datei gelöscht, und zwar die
 * einzige Stelle, an der diese Antwort steht.
 */

export function DeleteQuestionButton({
  slug,
  question,
}: {
  slug: string;
  question: string;
}) {
  const router = useRouter();
  const [sicher, setSicher] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!sicher) {
    return (
      <div className="space-y-2">
        <Button size="klein" variant="leise" onClick={() => setSicher(true)}>
          <Trash2 aria-hidden className="size-3.5" />
          Diese Frage entfernen
        </Button>
        {fehler ? <p className="text-sm text-warnung">{fehler}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-warnung/40 bg-warnung-grund p-3">
      <p className="text-sm text-warnung">
        „{question}“ samt Antwort löschen? Die Datei{" "}
        <code>fragen/{slug}.md</code> ist danach weg.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="klein"
          variant="primaer"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const ergebnis = await deleteQuestionAction(slug);
              if (ergebnis.ok) {
                router.push("/fragen");
                router.refresh();
                return;
              }
              setFehler(ergebnis.error);
              setSicher(false);
            })
          }
        >
          <Trash2 aria-hidden className="size-3.5" />
          {pending ? "Wird entfernt …" : "Ja, entfernen"}
        </Button>
        <Button
          size="klein"
          variant="sekundaer"
          disabled={pending}
          onClick={() => setSicher(false)}
        >
          Behalten
        </Button>
      </div>
    </div>
  );
}
