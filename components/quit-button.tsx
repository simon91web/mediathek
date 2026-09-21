"use client";

import { useState } from "react";
import { Power } from "lucide-react";

import { Button } from "@/components/ui/basis";
import { cn } from "@/lib/utils";

/*
 * Beendet den Server. Dasselbe tut das rote x am Mediathek-Fenster — der
 * Starter merkt, dass das Fenster weg ist, und räumt Chrome plus Server weg.
 */

export function QuitButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);

  const beenden = async () => {
    setPending(true);
    try {
      await fetch("/api/beenden", { method: "POST" });
    } catch {
      // Der Server ist schon weg — das ist der Erfolg.
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => void beenden()}
        className={className}
      >
        <Power aria-hidden className="size-4 shrink-0 text-schrift-2" />
        {pending ? "Beendet …" : "Mediathek beenden"}
      </button>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        variant="sekundaer"
        disabled={pending}
        onClick={() => void beenden()}
      >
        <Power aria-hidden className="size-4" />
        {pending ? "Beendet …" : "Mediathek beenden"}
      </Button>
      <p className="text-xs text-schrift-2">
        Hält den Server an. Das rote x am Fenster tut dasselbe.
      </p>
    </div>
  );
}
