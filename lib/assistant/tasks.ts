/*
 * Was ein KI-Werkzeug in dieser Bibliothek tun darf — und wie man es ihm
 * sagt.
 *
 * Bewusst OHNE "server-only" und ohne jede Abhängigkeit: die Liste ist die
 * Positivliste, gegen die geprüft wird, und sie wird an drei Stellen
 * gebraucht (sichtbares Fenster, unbeaufsichtigter Lauf, Oberfläche). Läge
 * sie in einem der Starter, müsste der andere ihn importieren.
 */

export const ASSISTANT_TASKS = [
  "kapitel",
  "kapitel-alle",
  "bezuege",
  "themen",
  "glossar",
  "fragen",
] as const;

export type AssistantTask = (typeof ASSISTANT_TASKS)[number];

/** Welche Aufgaben sich auf einen einzelnen Beitrag beziehen. */
const NEEDS_SLUG = new Set<AssistantTask>(["kapitel", "bezuege"]);

export function needsSlug(task: AssistantTask): boolean {
  return NEEDS_SLUG.has(task);
}

export const ASSISTANT_TASK_LABEL: Record<AssistantTask, string> = {
  kapitel: "Kapitel und Zusammenfassung erzeugen",
  "kapitel-alle": "Alle Beiträge ohne Kapitel nacharbeiten",
  bezuege: "Verwandte Stellen suchen",
  themen: "Themenseiten erzeugen",
  glossar: "Glossar sammeln",
  fragen: "Ähnliche Fragen zusammenfassen",
};

/** Der Ordner in der Bibliothek, in dem die Anleitungen liegen. */
export const INSTRUCTIONS_DIR = "anleitungen";

/**
 * Der Auftragstext.
 *
 * Bewusst ein Satz und keine Anweisungsliste: die Regeln stehen in der
 * Anleitung, und die liest das Werkzeug selbst. Damit bleibt die
 * Kommandozeile kurz, und es gibt nichts zu maskieren.
 */
export function buildPrompt(task: AssistantTask, slug: string | null): string {
  const datei = `${INSTRUCTIONS_DIR}/${task}.md`;
  return slug
    ? `Befolge die Anweisungen in ${datei}. Es geht um den Beitrag ${slug}.`
    : `Befolge die Anweisungen in ${datei}.`;
}
