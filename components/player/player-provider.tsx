"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { PlayerStore, PlayerStoreContext } from "./player-store";

/**
 * Stellt den Player-Store für die ganze Beitragsseite bereit. Kennt vidstack
 * nicht — das tut nur components/player/media-view.tsx.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  // Ein Store je Beitragsseite; der Schlüssel der Seite sorgt für Neuanlage.
  const [store] = useState(() => new PlayerStore());

  return (
    <PlayerStoreContext.Provider value={store}>
      {children}
    </PlayerStoreContext.Provider>
  );
}
