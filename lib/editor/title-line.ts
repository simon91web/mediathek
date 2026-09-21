import { yamlString } from "@/lib/library/beitrag-md";

/*
 * Der Stift neben der Überschrift im Editor.
 *
 * Ändert NUR die titel-Zeile im Kopfbereich, alles andere bleibt Zeichen für
 * Zeichen erhalten — genau wie eine Kapitelzeile nur an ihrer Stelle
 * eingefügt wird. Rein und ohne Dateizugriff, damit sich das testen lässt.
 */

export type SetTitleResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

const TITLE_LINE = /^(\s*)(titel|title)(\s*:\s*)/i;

export function setTitleLine(source: string, newTitle: string): SetTitleResult {
  const title = newTitle.trim();
  if (!title) return { ok: false, reason: "Der Titel darf nicht leer sein." };

  const lines = source.split("\n");

  let first = 0;
  while (first < lines.length && lines[first].trim() === "") first += 1;
  if (lines[first]?.trim() !== "---") {
    return { ok: false, reason: "Kein Kopfbereich (Frontmatter) gefunden." };
  }

  let closeLine = -1;
  for (let i = first + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---" || lines[i].trim() === "...") {
      closeLine = i;
      break;
    }
  }
  if (closeLine === -1) {
    return { ok: false, reason: "Der Kopfbereich wird nicht geschlossen." };
  }

  const encoded = yamlString(title);
  let found = -1;
  for (let i = first + 1; i < closeLine; i += 1) {
    if (TITLE_LINE.test(lines[i])) {
      found = i;
      break;
    }
  }

  if (found === -1) {
    // Kein titel-Feld da (ungewöhnlich — die Vorlage setzt immer eins):
    // als erste Zeile im Kopf einfügen.
    lines.splice(first + 1, 0, `titel: ${encoded}`);
  } else {
    const match = TITLE_LINE.exec(lines[found])!;
    lines[found] = `${match[1]}${match[2]}: ${encoded}`;
  }

  return { ok: true, content: lines.join("\n") };
}
