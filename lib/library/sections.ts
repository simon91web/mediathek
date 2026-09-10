import { formatTimecode, parseTimecode } from "./chapters";
import type { Chapter, ItemProblem } from "./types";

/*
 * Marker-Blöcke sind das Schreibfenster für Claude Code und den Editor.
 * Alles außerhalb der Marker bleibt unberührt — nur deshalb ist es
 * vertretbar, ein Sprachmodell in eine handgeschriebene Datei schreiben zu
 * lassen.
 *
 *   <!-- kapitel:start -->
 *   00:00 Einleitung
 *   <!-- kapitel:ende -->
 */

export const BLOCK_NAMES = [
  "kapitel",
  "zusammenfassung",
  "kapitelzusammenfassungen",
  "bezuege",
  "anhaenge",
  /** Nur in themen/<slug>.md: die einzelnen Stellen zum Thema. */
  "fundstellen",
] as const;

export type BlockName = (typeof BLOCK_NAMES)[number];

export type Block = {
  name: BlockName;
  /** Inhalt zwischen den Markern, ohne die Markerzeilen selbst. */
  inner: string;
  /** Zeile der ersten Inhaltszeile (1-basiert, bezogen auf den Body). */
  innerStartLine: number;
  /** Zeile der Start-Markierung (1-basiert). */
  openLine: number;
  /** Zeile der Ende-Markierung (1-basiert). */
  closeLine: number;
};

const BLOCK_MARKER =
  /^\s*<!--\s*([a-z]+)\s*:\s*(start|ende|end)\s*-->\s*$/i;

export function openMarker(name: BlockName): string {
  return `<!-- ${name}:start -->`;
}

export function closeMarker(name: BlockName): string {
  return `<!-- ${name}:ende -->`;
}

function isBlockName(value: string): value is BlockName {
  return (BLOCK_NAMES as readonly string[]).includes(value);
}

/**
 * Findet alle Marker-Blöcke. Unbekannte Namen und unpaarige Marker erzeugen
 * einen Hinweis, brechen aber nichts: eine Datei mit einem vergessenen
 * Ende-Marker soll weiter anzeigbar bleiben.
 */
export function findBlocks(body: string): {
  blocks: Map<BlockName, Block>;
  problems: ItemProblem[];
} {
  const lines = body.split("\n");
  const blocks = new Map<BlockName, Block>();
  const problems: ItemProblem[] = [];
  let open: { name: BlockName; line: number } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const match = BLOCK_MARKER.exec(lines[i]);
    if (!match) continue;
    const name = match[1].toLowerCase();
    const isStart = match[2].toLowerCase() === "start";

    if (!isBlockName(name)) {
      problems.push({
        kind: "zusammenfassung",
        message: `Unbekannter Marker "${name}" — er wird ignoriert.`,
        line: i + 1,
      });
      continue;
    }

    if (isStart) {
      if (open) {
        problems.push({
          kind: "zusammenfassung",
          message:
            `Der Block "${open.name}" wurde nicht geschlossen, bevor ` +
            `"${name}" beginnt.`,
          line: i + 1,
        });
      }
      if (blocks.has(name)) {
        problems.push({
          kind: "zusammenfassung",
          message: `Der Block "${name}" kommt mehrfach vor; der erste gilt.`,
          line: i + 1,
        });
        open = null;
        continue;
      }
      open = { name, line: i + 1 };
      continue;
    }

    if (!open || open.name !== name) {
      problems.push({
        kind: "zusammenfassung",
        message: `Ende-Marker für "${name}" ohne passenden Anfang.`,
        line: i + 1,
      });
      continue;
    }

    blocks.set(name, {
      name,
      inner: lines.slice(open.line, i).join("\n"),
      innerStartLine: open.line + 1,
      openLine: open.line,
      closeLine: i + 1,
    });
    open = null;
  }

  if (open) {
    problems.push({
      kind: "zusammenfassung",
      message:
        `Der Block "${open.name}" wird nicht geschlossen — es fehlt ` +
        `"${closeMarker(open.name)}".`,
      line: open.line,
    });
  }

  return { blocks, problems };
}

/**
 * Ersetzt Block-Bereiche durch gleich viele Leerzeilen. Der Trick daran: alle
 * Zeilennummern bleiben gültig, sodass Fehlermeldungen und Editor-Sprünge
 * weiter auf die richtige Zeile der Originaldatei zeigen.
 */
export function blankBlocks(
  body: string,
  blocks: ReadonlyMap<BlockName, Block>,
  keep: readonly BlockName[] = [],
): string {
  const lines = body.split("\n");
  for (const block of blocks.values()) {
    if (keep.includes(block.name)) continue;
    for (let i = block.openLine - 1; i < block.closeLine; i += 1) {
      lines[i] = "";
    }
  }
  return lines.join("\n");
}

/**
 * Der Text ohne alle Marker-Blöcke: bei Video und Audio die Beschreibung, bei
 * Textbeiträgen der Inhalt selbst. Mehrfache Leerzeilen werden zu einer
 * zusammengezogen, damit an der Stelle eines entfernten Blocks kein Loch
 * klafft.
 */
export function stripBlocks(
  body: string,
  blocks: ReadonlyMap<BlockName, Block>,
): string {
  const lines = body.split("\n");
  const drop = new Set<number>();
  for (const block of blocks.values()) {
    for (let i = block.openLine - 1; i < block.closeLine; i += 1) {
      drop.add(i);
    }
  }
  return lines
    .filter((_, i) => !drop.has(i))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ChapterSummary = {
  /** Zeit aus der Überschrift, falls vorhanden. */
  start: number | null;
  title: string;
  text: string;
  line: number;
};

/**
 * Liest den Block "kapitelzusammenfassungen". Erwartet Überschriften der Form
 * "### 01:24 Akku prüfen", darunter der Text.
 */
export function parseChapterSummaries(
  inner: string,
  innerStartLine: number,
): ChapterSummary[] {
  const lines = inner.split("\n");
  const found: ChapterSummary[] = [];
  let current: ChapterSummary | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (!current) return;
    current.text = buffer.join("\n").trim();
    if (current.title || current.text) found.push(current);
    buffer.length = 0;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (heading) {
      flush();
      const label = heading[1].trim();
      // Führende Zeitmarke abtrennen, der Rest ist der Titel.
      const withTime = /^(\d{1,3}:\d{2}(?::\d{2})?)(?:\s*[-–—:|·]?\s*)(.*)$/.exec(
        label,
      );
      const start = withTime ? parseTimecode(withTime[1]) : null;
      current = {
        start,
        title: (withTime && start !== null ? withTime[2] : label).trim(),
        text: "",
        line: innerStartLine + i,
      };
      continue;
    }
    if (current) buffer.push(lines[i]);
  }
  flush();

  return found;
}

/** Für den Titelvergleich: Groß-/Kleinschreibung und Umlaute egalisieren. */
function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Hängt die Zusammenfassungen an die Kapitel. Zugeordnet wird primär über die
 * Zeitmarke, sekundär über den normalisierten Titel — Claude Code schreibt
 * beides, aber ein von Hand geänderter Titel soll die Zuordnung nicht
 * zerstören.
 *
 * Verändert `chapters` an Ort und Stelle und gibt die Hinweise zurück.
 */
export function attachChapterSummaries(
  chapters: Chapter[],
  summaries: readonly ChapterSummary[],
): ItemProblem[] {
  const problems: ItemProblem[] = [];
  const byTime = new Map<number, Chapter>();
  const byTitle = new Map<string, Chapter>();
  for (const chapter of chapters) {
    if (chapter.kind === "zeit") byTime.set(chapter.start, chapter);
    const key = normalizeTitle(chapter.title);
    if (key && !byTitle.has(key)) byTitle.set(key, chapter);
  }

  for (const summary of summaries) {
    if (!summary.text) continue;
    const target =
      (summary.start !== null ? byTime.get(summary.start) : undefined) ??
      byTitle.get(normalizeTitle(summary.title));

    if (!target) {
      problems.push({
        kind: "zusammenfassung",
        message:
          `Die Zusammenfassung "${summary.title || "ohne Titel"}"` +
          (summary.start !== null
            ? ` (${formatTimecode(summary.start)})`
            : "") +
          " gehört zu keinem Kapitel.",
        line: summary.line,
      });
      continue;
    }
    target.summary = summary.text;
  }

  return problems;
}

/**
 * Beschriftungen der Anhänge aus dem Block "anhaenge".
 * Erwartet Zeilen der Form "- pruefzettel.pdf — Prüfzettel zum Ausdrucken".
 */
export function parseAttachmentLabels(inner: string): Map<string, string> {
  const labels = new Map<string, string>();
  for (const line of inner.split("\n")) {
    const match = /^\s*[-*]\s*([^\s—–|]+(?:\s[^\s—–|]+)*?)\s*(?:[—–|]|\s-\s)\s*(.+)$/.exec(
      line,
    );
    if (match) {
      labels.set(match[1].trim().toLowerCase(), match[2].trim());
      continue;
    }
    // Zeile nur mit Dateinamen: kein Fehler, nur keine Beschriftung.
    const bare = /^\s*[-*]\s*(\S+)\s*$/.exec(line);
    if (bare) labels.set(bare[1].trim().toLowerCase(), "");
  }
  return labels;
}

/**
 * Schreibt einen Block neu und lässt alles andere unangetastet. Fehlt das
 * Markerpaar, wird es am Ende angefügt. Das ist die eine Funktion, über die
 * Editor und Werkzeuge Blöcke ändern.
 */
export function replaceBlock(
  source: string,
  name: BlockName,
  content: string,
): string {
  const { blocks } = findBlocks(source);
  const block = blocks.get(name);
  const inner = content.replace(/\s+$/, "");

  if (!block) {
    const separator = source.endsWith("\n") ? "" : "\n";
    return (
      `${source}${separator}\n${openMarker(name)}\n` +
      `${inner}${inner ? "\n" : ""}${closeMarker(name)}\n`
    );
  }

  const lines = source.split("\n");
  const before = lines.slice(0, block.openLine);
  const after = lines.slice(block.closeLine - 1);
  const middle = inner ? inner.split("\n") : [];
  return [...before, ...middle, ...after].join("\n");
}
