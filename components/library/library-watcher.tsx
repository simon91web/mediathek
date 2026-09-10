"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/*
 * Das eigentliche Versprechen der Mediathek, clientseitig: Claude Code trägt
 * Kapitel in beitrag.md ein, und die offene Seite zeigt sie — ohne Neuladen
 * von Hand und ohne Serverneustart.
 *
 * Abgefragt statt SSE, weil es ein lokaler Server mit einem Nutzer ist und
 * eine offene Verbindung den Hot-Reload im Entwicklungsbetrieb nicht sauber
 * übersteht. Nur bei sichtbarem Tab, damit ein vergessenes Fenster keine
 * Anfragen erzeugt.
 */

const INTERVAL_MS = 5_000;

export function LibraryWatcher() {
  const router = useRouter();
  const generation = useRef<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/bibliothek", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { generation: number };
        if (cancelled) return;

        if (generation.current === null) {
          generation.current = data.generation;
          return;
        }
        if (data.generation > generation.current) {
          generation.current = data.generation;
          router.refresh();
          setHint("Die Bibliothek hat sich geändert.");
          setTimeout(() => setHint(null), 4000);
        }
      } catch {
        // Server neu gestartet oder gerade beschäftigt: beim nächsten Mal.
      }
    };

    const loop = () => {
      timer = setTimeout(async () => {
        await check();
        if (!cancelled) loop();
      }, INTERVAL_MS);
    };

    void check();
    loop();

    // Nach der Rückkehr in den Tab sofort nachsehen, nicht erst in fünf Sekunden.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  if (!hint) return null;

  return (
    <div
      role="status"
      className="animate-in fade-in slide-in-from-bottom-2 fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-rand bg-grund-2 px-4 py-2 text-sm shadow-lg"
    >
      {hint}
    </div>
  );
}
