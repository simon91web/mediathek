"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { tidyQuestionsAction } from "@/app/fragen/actions";
import { Button } from "@/components/ui/basis";

/*
 * Der Knopf, der den Haufen sortiert.
 *
 * Fragen entstehen hier von selbst — jede im Chat beantwortete landet in
 * fragen/. Das ist gewollt und erzeugt zwangsläufig Doppeltes. Dieser Knopf
 * schickt das KI-Werkzeug los, das nach `anleitungen/fragen.md` arbeitet:
 * gleichartige Fragen werden zu einem Eintrag, die anderen Formulierungen
 * wandern in „auch gefragt".
 *
 * Kein Fenster, sondern ein Auftrag in der Schlange: sonst müsste man
 * danebensitzen. Nachzulesen ist es hinterher im Protokoll des Auftrags.
 */

export function TidyQuestionsButton() {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-1">
      <Button
        size="klein"
        variant="sekundaer"
        disabled={pending}
        onClick={() => {
          setNote(null);
          startTransition(async () => {
            const result = await tidyQuestionsAction();
            setNote(
              result.ok
                ? { ok: true, text: result.message }
                : { ok: false, text: result.error },
            );
          });
        }}
      >
        <Sparkles aria-hidden className="size-3.5" />
        {pending ? "Wird angestellt …" : "Fragen aufräumen"}
      </Button>
      {note ? (
        <p className={`text-xs ${note.ok ? "text-akzent" : "text-warnung"}`}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
