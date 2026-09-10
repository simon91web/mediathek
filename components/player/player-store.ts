"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

import { activeChapterIndex } from "@/lib/library/chapters";

/*
 * Der Player steht oben, die Kapitelliste und das Transkript stehen daneben.
 * Damit beide miteinander reden können, ohne dass die halbe Seite an vidstack
 * hängt, gibt es diesen kleinen Store.
 *
 * Der Gewinn: components/player/media-view.tsx ist die EINZIGE Datei, die
 * @vidstack/react importiert. Wird der Player je ausgetauscht, ist genau eine
 * Datei betroffen.
 */

export type PlayerSnapshot = {
  currentTime: number;
  duration: number;
  paused: boolean;
  /** true, sobald die Metadaten da sind — vorher ist ein Sprung wirkungslos. */
  ready: boolean;
  /** true, wenn das Ende eines Ausschnitts erreicht wurde (Sammlung). */
  reachedStop: boolean;
};

export type PlayerRemote = {
  seek(seconds: number): void;
  play(): void;
  pause(): void;
};

const EMPTY: PlayerSnapshot = {
  currentTime: 0,
  duration: 0,
  paused: true,
  ready: false,
  reachedStop: false,
};

export class PlayerStore {
  #listeners = new Set<() => void>();
  #snapshot: PlayerSnapshot = EMPTY;
  #remote: PlayerRemote | null = null;
  /** Ein Sprung, der vor dem Laden der Metadaten verlangt wurde. */
  #pendingSeek: { seconds: number; play: boolean } | null = null;
  /**
   * Ende des laufenden Ausschnitts. Gesetzt, wenn die Adresse ein "bis="
   * trägt — so wird eine Sammlung zur Ausschnitts-Wiedergabe, ohne dass der
   * Player davon wissen muss.
   */
  #stopAt: number | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): PlayerSnapshot => this.#snapshot;

  #emit() {
    for (const listener of this.#listeners) listener();
  }

  /** Vom Player, gedrosselt. */
  publish(next: Partial<PlayerSnapshot>): void {
    const merged = { ...this.#snapshot, ...next };
    if (
      merged.currentTime === this.#snapshot.currentTime &&
      merged.duration === this.#snapshot.duration &&
      merged.paused === this.#snapshot.paused &&
      merged.ready === this.#snapshot.ready &&
      merged.reachedStop === this.#snapshot.reachedStop
    ) {
      return;
    }
    const becameReady = merged.ready && !this.#snapshot.ready;
    this.#snapshot = merged;
    this.#emit();

    /*
     * Der klassische Fehler bei Sprungzielen aus der Adresse: currentTime
     * setzen, bevor die Metadaten da sind — das verwirft der Browser still.
     * Deshalb wird der Sprung hier nachgeholt.
     */
    if (becameReady && this.#pendingSeek) {
      const pending = this.#pendingSeek;
      this.#pendingSeek = null;
      this.#remote?.seek(pending.seconds);
      if (pending.play) this.#remote?.play();
    }
  }

  /**
   * Das Ende des Ausschnitts anmelden. Reine Einstellung, kein Zustand —
   * deshalb ohne Benachrichtigung, sonst würde der Effect, der das setzt,
   * ein Neurendern auslösen, das ihn wieder aufruft.
   */
  setStopAt(seconds: number | null): void {
    this.#stopAt = seconds !== null && seconds > 0 ? seconds : null;
    if (this.#snapshot.reachedStop) this.publish({ reachedStop: false });
  }

  /**
   * Vom Player auf JEDEM Zeitsprung — bewusst ungedrosselt, anders als
   * `publish`. Bei 250 ms Drosselung liefe der Ausschnitt bis zu eine
   * Viertelsekunde über sein Ende hinaus, und genau das hört man.
   */
  checkStop(currentTime: number): void {
    if (this.#stopAt === null) return;
    if (currentTime + 0.05 < this.#stopAt) return;
    this.#stopAt = null;
    this.#remote?.pause();
    this.publish({ currentTime, paused: true, reachedStop: true });
  }

  /** Von Kapitelliste, Beschreibung, Transkript und Suchtreffern. */
  seekTo(seconds: number, options: { play?: boolean } = {}): void {
    const target = Math.max(0, seconds);
    // Wer selbst springt, hat den Ausschnitt verlassen.
    if (this.#snapshot.reachedStop) this.publish({ reachedStop: false });
    if (!this.#remote || !this.#snapshot.ready) {
      this.#pendingSeek = { seconds: target, play: options.play ?? false };
      return;
    }
    this.#remote.seek(target);
    if (options.play) this.#remote.play();
    // Sofort veröffentlichen, damit die Hervorhebung nicht hinterherhinkt.
    this.publish({ currentTime: target });
  }

  attach(remote: PlayerRemote): () => void {
    this.#remote = remote;
    if (this.#pendingSeek && this.#snapshot.ready) {
      const pending = this.#pendingSeek;
      this.#pendingSeek = null;
      remote.seek(pending.seconds);
      if (pending.play) remote.play();
    }
    return () => {
      if (this.#remote === remote) this.#remote = null;
    };
  }

  reset(): void {
    this.#snapshot = EMPTY;
    this.#pendingSeek = null;
    this.#stopAt = null;
    this.#emit();
  }
}

const PlayerContext = createContext<PlayerStore | null>(null);

export const PlayerStoreContext = PlayerContext;

export function usePlayerStore(): PlayerStore | null {
  return useContext(PlayerContext);
}

/**
 * Liest einen abgeleiteten Wert aus dem Player-Zustand.
 *
 * Der Selektor MUSS einen Vergleichbaren Wert liefern (Zahl, Zeichenkette,
 * Wahrheitswert) — bei einem Objekt würde jede Zeitänderung ein Neurendern
 * auslösen.
 */
export function usePlayerValue<T extends string | number | boolean | null>(
  selector: (snapshot: PlayerSnapshot) => T,
  fallback: T,
): T {
  const store = usePlayerStore();
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? (() => {}),
    [store],
  );
  const getSnapshot = useCallback(
    () => (store ? selector(store.getSnapshot()) : fallback),
    [store, selector, fallback],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

/**
 * Der Index des aktiven Kapitels.
 *
 * Der Kniff: der Selektor liefert den INDEX, nicht die Zeit. Der Index
 * wechselt bei einem Transkript mit 3-Sekunden-Segmenten alle drei Sekunden
 * — nicht viermal pro Sekunde. Ohne das rendert eine Liste mit 1800 Zeilen
 * viermal je Sekunde neu, und der Tab wird heiß.
 */
export function useActiveIndex(starts: readonly number[]): number {
  const store = usePlayerStore();
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? (() => {}),
    [store],
  );
  const getSnapshot = useCallback(() => {
    if (!store) return -1;
    return activeChapterIndex(starts, store.getSnapshot().currentTime);
  }, [store, starts]);
  return useSyncExternalStore(subscribe, getSnapshot, () => -1);
}
