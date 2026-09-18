"use client";

import { markPlatformTourSeenAction } from "@/app/einstellungen/actions";

/*
 * Der Zustand der Tour — ein Modul-Singleton, kein Context.
 *
 * Der Header lebt in app/layout.tsx und überlebt jeden Routenwechsel im App
 * Router unverändert; ein einziges <TourOverlay/> dort tut das ebenso. Ein
 * Context wie beim Player wäre hier Aufwand ohne Gegenwert: es gibt nie zwei
 * Touren gleichzeitig, anders als es mehrere Player geben könnte.
 */

export type TourId = "platform" | "workflow";

type SpotStep = {
  /** data-tour-Attribut des Zielelements. */
  target: string;
  title: string;
  text: string;
};

type CenterStep = {
  target: null;
  title: string;
  text: string;
  cta: string;
  /** Zweiter, leiser Knopf — nur beim Einstieg, um sofort abzubrechen. */
  secondary?: string;
};

export type TourStep = SpotStep | CenterStep;

const PLATFORM_STEPS: TourStep[] = [
  {
    target: null,
    title: "Willkommen in deiner Mediathek",
    text: "Ein kurzer Rundgang zeigt dir, wo du Beiträge findest, wie die Suche funktioniert und was die Symbole oben bedeuten. Dauert etwa eine Minute.",
    cta: "Rundgang starten",
    secondary: "Später",
  },
  {
    target: "nav",
    title: "Medien, Themen, Sammlungen, Fragen",
    text: "Medien sind deine Videos, Sprachmemos und Texte. Themen und Sammlungen ordnen sie fachlich, Fragen sammelt beantwortete Fragen aus dem Chat.",
  },
  {
    target: "search",
    title: "Die Suche kennt Synonyme",
    text: "Suchst du „Balancing“, findet sie auch Stellen, an denen „Zellspannung“ gesagt wurde – wenn eine Themenseite das verknüpft.",
  },
  {
    target: "jobs",
    title: "Aufträge live verfolgen",
    text: "Läuft gerade eine Transkription oder die Kette, siehst du das hier – mit Zähler, solange etwas offen ist.",
  },
  {
    target: "import",
    title: "Neue Aufnahmen importieren",
    text: "Hochladen oder aus einem Ordner übernehmen – von hier aus kommt alles Neue in die Bibliothek.",
  },
  {
    target: "settings",
    title: "Einstellungen",
    text: "Bibliotheksordner wechseln, Verarbeitung konfigurieren – und diesen Rundgang jederzeit wiederholen.",
  },
  {
    target: "card1",
    title: "Ein Beitrag im Detail",
    text: "Klick auf eine Kachel öffnet den Player mit Kapiteln, Text und Anhängen.",
  },
];

const WORKFLOW_STEPS: TourStep[] = [
  {
    target: null,
    title: "So kommt ein Beitrag in die Bibliothek",
    text: "Vom Import bis zum durchsuchbaren, verlinkten Beitrag – am Beispiel eines echten Beitrags.",
    cta: "Los geht's",
    secondary: "Überspringen",
  },
  {
    target: "import",
    title: "Import",
    text: "Datei hochladen oder Ordner angeben – Video, Audio oder gleich ein Textbeitrag.",
  },
  {
    target: "kette",
    title: "Alles erschließen",
    text: "Ein Knopf stellt Transkription, Kapitel, Suche und Bezüge als Aufträge in die Schlange – der Reihe nach, jeder baut auf dem vorigen auf.",
  },
  {
    target: "jobs",
    title: "Fortschritt mitlesen",
    text: "Jeder Schritt der Kette läuft hier durch – mit Protokoll, falls etwas schiefgeht.",
  },
  {
    target: "kapitel",
    title: "Kapitel sind Zeilen im Text",
    text: "„01:24 Akku prüfen“ – von Hand getippt, per Klick eingefügt oder von einem KI-Werkzeug geschrieben. Alle drei ergeben dasselbe Format.",
  },
  {
    target: "themen",
    title: "Bezüge entstehen von selbst",
    text: "Themen in diesem Beitrag und verlinkte Beiträge werden berechnet – nichts davon musst du doppelt pflegen.",
  },
  {
    target: null,
    title: "Das war's",
    text: "Du kennst jetzt den Weg vom Rohmaterial zum durchsuchbaren Beitrag.",
    cta: "Fertig",
  },
];

const TOURS: Record<TourId, TourStep[]> = {
  platform: PLATFORM_STEPS,
  workflow: WORKFLOW_STEPS,
};

export type TourState =
  | { tour: null }
  | { tour: "crosspromo" }
  | { tour: TourId; step: number };

const INITIAL: TourState = { tour: null };

let state: TourState = INITIAL;
const listeners = new Set<() => void>();

function setState(next: TourState) {
  state = next;
  for (const listener of listeners) listener();
}

function current(): { tour: TourId; step: number } | null {
  return state.tour && state.tour !== "crosspromo"
    ? (state as { tour: TourId; step: number })
    : null;
}

export const tourStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): TourState {
    return state;
  },
  getServerSnapshot(): TourState {
    return INITIAL;
  },
  steps(tour: TourId): readonly TourStep[] {
    return TOURS[tour];
  },

  start(tour: TourId) {
    setState({ tour, step: 0 });
  },

  next() {
    const active = current();
    if (!active) return;
    const steps = TOURS[active.tour];
    if (active.step < steps.length - 1) {
      setState({ tour: active.tour, step: active.step + 1 });
      return;
    }
    if (active.tour === "platform") {
      void markPlatformTourSeenAction();
      setState({ tour: "crosspromo" });
      return;
    }
    tourStore.end();
  },

  back() {
    const active = current();
    if (!active || active.step === 0) return;
    setState({ tour: active.tour, step: active.step - 1 });
  },

  /** Direkt zu einem Schritt springen — für die Punkte im Tooltip. */
  goto(index: number) {
    const active = current();
    if (!active) return;
    const steps = TOURS[active.tour];
    if (index < 0 || index >= steps.length) return;
    setState({ tour: active.tour, step: index });
  },

  /** Bricht sofort ab — kein Fortsetzen an alter Stelle, die Touren sind kurz genug. */
  skip() {
    const active = current();
    if (active?.tour === "platform") void markPlatformTourSeenAction();
    tourStore.end();
  },

  end() {
    setState({ tour: null });
  },

  acceptCrosspromo() {
    tourStore.start("workflow");
  },

  declineCrosspromo() {
    tourStore.end();
  },
};
