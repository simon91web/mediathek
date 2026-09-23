export const TASKS = [
  "inbox",
  "sichtung",
  "kapitel",
  "kapitel-alle",
  "bezuege",
  "themen",
  "glossar",
  "fragen",
  "vollstaendigkeit",
  "bestand",
] as const;

export type TaskId = (typeof TASKS)[number];

const NEEDS_NOTE = new Set<TaskId>(["kapitel", "bezuege"]);

export function needsNote(task: TaskId): boolean {
  return NEEDS_NOTE.has(task);
}

export const TASK_LABEL: Record<TaskId, string> = {
  inbox: "Inbox sichten",
  sichtung: "Eine Datei beurteilen",
  kapitel: "Diese Notiz erschließen",
  "kapitel-alle": "Notizen ohne Kapitel erschließen",
  bezuege: "Bezüge für diese Notiz",
  themen: "Karten pflegen",
  glossar: "Glossar sammeln",
  fragen: "Fragen zusammenfassen",
  vollstaendigkeit: "Lücken analysieren",
  bestand: "Bestand fragen",
};

export function instructionFile(task: TaskId): string {
  return `anleitungen/${task}.md`;
}

/** Ein Satz. Die Regeln stehen in der Anleitung, das Werkzeug liest sie selbst. */
export function buildPrompt(task: TaskId, noteName: string | null): string {
  const file = instructionFile(task);
  if (task === "bestand") {
    return `Befolge die Anweisungen in ${file}.`;
  }
  return noteName
    ? `Befolge die Anweisungen in ${file}. Es geht um die Notiz ${noteName}.`
    : `Befolge die Anweisungen in ${file}.`;
}

export function buildBestandPrompt(question: string): string {
  return `${buildPrompt("bestand", null)}\n\nFrage:\n${question.trim()}\n`;
}

const TOOLSET_VERSION = /^version:\s*(\d+)\s*$/m;

export function readToolsetVersion(text: string): number | null {
  const match = TOOLSET_VERSION.exec(text);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

export function assertToolsetVersion(text: string | null): void {
  if (text === null) return;
  const version = readToolsetVersion(text);
  if (version !== 1) {
    throw new Error(
      version === null
        ? "toolset.yaml hat keine version."
        : `toolset.yaml hat version ${version}. Dieses Plugin kennt version 1.`,
    );
  }
}
