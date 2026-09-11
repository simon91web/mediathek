import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { paths } from "@/lib/paths";
import { closeMarker, openMarker } from "./sections";
import { assertSlug, slugify, uniqueSlug } from "./slug";
import type { Slug } from "./types";

/*
 * Fragen aufheben.
 *
 * Der Chat war bis hierher flüchtig: gefragt, gelesen, weg. Das ist für ein
 * Gespräch richtig und für eine Wissensdatenbank falsch — die zweite Person,
 * die dieselbe Frage hat, soll die Antwort schon vorfinden.
 *
 * Deshalb wird JEDE beantwortete Frage abgelegt, ohne Nachfrage. Eine
 * Rückfrage („aufheben?") würde in neun von zehn Fällen weggeklickt, und
 * genau die zehnte wäre die wichtige. Was sich als Lärm erweist, lässt sich
 * auf /fragen mit einem Klick entfernen, und das Zusammenfassen räumt den
 * Rest zusammen.
 *
 * Der Preis ist bewusst in Kauf genommen: in fragen/ landet auch Halbgares.
 * Ein Bestand, der wächst und gejätet wird, ist mehr wert als einer, der nie
 * entsteht, weil jeder Eintrag eine Entscheidung verlangt.
 */

/** Länger als das ist keine Frage mehr, sondern ein eingefügter Text. */
const MAX_QUESTION = 300;
/** Der Dateiname wird aus der Frage gebildet — nicht aus dem ganzen Satz. */
const MAX_SLUG_WORDS = 8;

export type NewQuestion = {
  question: string;
  answer: string;
  /** Wurde beim Beantworten auch das Internet gelesen? */
  usedWeb?: boolean;
  /** Nur für Tests: sonst der heutige Tag. */
  askedAt?: string;
};

export type SaveQuestionOutcome =
  { ok: true; slug: Slug } | { ok: false; error: string };

/** Wie write-collection: nur zitieren, wenn nötig — von Hand gelesen bleibt lesbar. */
function yamlString(value: string): string {
  const needsQuotes =
    /^[\s>|&*!%@`'"[{]/.test(value) ||
    /:\s/.test(value) ||
    /\s$/.test(value) ||
    value === "";
  if (!needsQuotes) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function heute(): string {
  const now = new Date();
  const monat = String(now.getMonth() + 1).padStart(2, "0");
  const tag = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${monat}-${tag}`;
}

/** Der Dateiinhalt. Getrennt, damit der Test ihn ohne Dateisystem prüfen kann. */
export function renderQuestionMarkdown(input: NewQuestion): string {
  const frage = input.question
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUESTION);

  const head = [
    "---",
    `frage: ${yamlString(frage)}`,
    `gefragt: ${input.askedAt ?? heute()}`,
    `quellen: [${input.usedWeb ? "bibliothek, web" : "bibliothek"}]`,
    "---",
    "",
  ];

  const body = [
    openMarker("antwort"),
    input.answer.trim(),
    closeMarker("antwort"),
  ];

  return `${head.join("\n")}${body.join("\n")}`.replace(/\s*$/, "\n");
}

/** Welche Kennungen in fragen/ schon belegt sind — case-insensitiv. */
async function takenSlugs(): Promise<Set<string>> {
  try {
    const entries = await fs.readdir(paths.questions);
    return new Set(
      entries
        .filter((name) => /\.md$/i.test(name))
        .map((name) => path.parse(name).name.toLowerCase()),
    );
  } catch {
    // Kein fragen/-Ordner: dann ist auch nichts belegt.
    return new Set();
  }
}

/**
 * Aus der Frage einen brauchbaren Dateinamen machen.
 *
 * Die ganze Frage als Slug wäre eine Zeile mit dreißig Bindestrichen — und
 * die 260-Zeichen-Pfadgrenze unter Windows ist näher, als man denkt. Die
 * ersten Wörter reichen; eindeutig macht ihn ohnehin `uniqueSlug`.
 */
function slugFromQuestion(question: string): string {
  const woerter = question
    .replace(/[?!.]+$/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SLUG_WORDS)
    .join(" ");
  return slugify(woerter);
}

/**
 * Legt `fragen/<slug>.md` an. Eine vorhandene Datei wird NIE überschrieben —
 * bei Namensgleichheit bekommt die neue eine Ziffer.
 */
export async function saveQuestion(
  input: NewQuestion,
): Promise<SaveQuestionOutcome> {
  const frage = input.question.trim();
  const antwort = input.answer.trim();
  if (!frage) return { ok: false, error: "Ohne Frage kein Eintrag." };
  if (!antwort) return { ok: false, error: "Ohne Antwort kein Eintrag." };

  const gewuenscht = slugFromQuestion(frage);
  if (!gewuenscht) {
    return {
      ok: false,
      error:
        "Aus dieser Frage lässt sich keine Kennung bilden. Sie braucht " +
        "Buchstaben oder Ziffern.",
    };
  }

  const belegt = await takenSlugs();
  const slug: Slug = uniqueSlug(gewuenscht, (candidate) =>
    belegt.has(candidate),
  );

  const file = path.join(paths.questions, `${slug}.md`);
  const temporary = `${file}.tmp`;

  try {
    await fs.mkdir(paths.questions, { recursive: true });
    // Atomar wie überall: erst daneben schreiben, dann umbenennen.
    await fs.writeFile(temporary, renderQuestionMarkdown(input), "utf8");
    await fs.rename(temporary, file);
    return { ok: true, slug };
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    return {
      ok: false,
      error: `Die Frage konnte nicht abgelegt werden: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Entfernt `fragen/<slug>.md`.
 *
 * Das einzige Löschen in dieser Anwendung — und es ist vertretbar, weil die
 * Dateien hier von selbst entstehen. Ein Beitrag wird nie gelöscht; eine
 * automatisch abgelegte Frage muss weggeräumt werden können, sonst traut sich
 * niemand, den Chat zu benutzen.
 */
export async function deleteQuestion(
  slugRoh: string,
): Promise<{ ok: boolean; error: string | null }> {
  let slug: Slug;
  try {
    slug = assertSlug(slugRoh.trim().toLowerCase());
  } catch {
    return { ok: false, error: "Diese Kennung gibt es nicht." };
  }

  // Der Pfad wird aus einer geprüften Kennung gebaut, nie aus der Eingabe.
  const file = path.join(paths.questions, `${slug}.md`);
  try {
    await fs.unlink(file);
    return { ok: true, error: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, error: "Diese Frage gibt es nicht (mehr)." };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
