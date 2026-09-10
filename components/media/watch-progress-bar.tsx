"use client";

import { useCallback, useSyncExternalStore } from "react";

import { progressRatio } from "@/lib/watch-progress";

/** Nichts abonnieren: der Wert ändert sich nicht, während die Kachel steht. */
const noopSubscribe = () => () => {};

/**
 * Der dünne Balken am unteren Rand einer Kachel.
 *
 * Gelesen über useSyncExternalStore mit einem Server-Snapshot von null: die
 * Position liegt im localStorage des Zuschauers, den es beim Rendern auf dem
 * Server nicht gibt. Serverseitig kommt also nichts, clientseitig der Wert —
 * ohne zweite Renderrunde und ohne Hydration-Fehler.
 */
export function WatchProgressBar({
  slug,
  durationSeconds,
}: {
  slug: string;
  durationSeconds: number | null;
}) {
  const getSnapshot = useCallback(
    () => progressRatio(slug, durationSeconds),
    [slug, durationSeconds],
  );
  const ratio = useSyncExternalStore(noopSubscribe, getSnapshot, () => null);

  if (ratio === null) return null;

  return (
    <div
      className="absolute inset-x-0 bottom-0 h-1 bg-black/40"
      title={`${Math.round(ratio * 100)} % angesehen`}
    >
      <div
        className="h-full bg-akzent"
        style={{ width: `${(ratio * 100).toFixed(1)}%` }}
      />
    </div>
  );
}
