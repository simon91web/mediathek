"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { createGlossaryEntryAction } from "@/app/glossar/actions";
import { Button } from "@/components/ui/basis";

/**
 * "+" für einen neuen Begriff — legt ihn mit leerer Definition an und
 * springt direkt in den Editor. Nur im Autorenmodus gerendert (Aufrufer).
 */
export function NeuerBegriff() {
  const [open, setOpen] = useState(false);
  const [begriff, setBegriff] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="klein" variant="sekundaer" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-3.5" />
        Neuer Begriff
      </Button>
    );
  }

  const submit = async () => {
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("begriff", begriff);
    const result = await createGlossaryEntryAction(formData);
    // Bei Erfolg leitet die Server Action per redirect() weiter — hier
    // landet dann nur noch der Fehlerfall.
    setPending(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={begriff}
        onChange={(event) => setBegriff(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Begriff, z. B. Erka-Control"
        aria-label="Neuer Begriff"
        className="h-8 w-56 rounded-lg border border-rand bg-grund-2 px-2.5 text-sm"
      />
      <Button
        size="klein"
        variant="primaer"
        disabled={pending || !begriff.trim()}
        onClick={() => void submit()}
      >
        {pending ? "Anlegen …" : "Anlegen"}
      </Button>
      <Button size="klein" variant="leise" onClick={() => setOpen(false)}>
        Abbrechen
      </Button>
      {error ? <span className="text-xs text-fehler">{error}</span> : null}
    </div>
  );
}
