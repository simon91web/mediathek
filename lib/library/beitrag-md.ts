import {
  buildSectionChapters,
  buildTimeChapters,
  linkifyTimeMentions,
  parseChapterLines,
  parseSectionLines,
} from "./chapters";
import {
  lineOffset,
  parseItemFrontmatter,
  shiftProblems,
  shiftSourceLines,
  splitFrontmatter,
} from "./frontmatter";
import type { ItemFrontmatter } from "./frontmatter";
import {
  attachChapterSummaries,
  blankBlocks,
  findBlocks,
  parseAttachmentLabels,
  parseChapterSummaries,
  stripBlocks,
} from "./sections";
import { humanizeSlug } from "./slug";
import { parseReferenceLines } from "./wikilink";
import type {
  Chapter,
  ItemProblem,
  MediaKind,
  Reference,
  Slug,
} from "./types";

export type ParsedItemMarkdown = {
  frontmatter: ItemFrontmatter;
  title: string;
  durationSeconds: number | null;
  /**
   * Bei Video und Audio die Beschreibung, bei Text der Inhalt selbst —
   * jeweils ohne Marker-Blöcke, mit Zeitmarken schon als Markdown-Links.
   */
  description: string;
  /** Dieselbe Beschreibung, aber ohne Link-Umschreibung (für den Editor). */
  rawDescription: string;
  chapters: Chapter[];
  summary: string | null;
  references: Reference[];
  /** Dateiname (kleingeschrieben) → Beschriftung aus dem Marker-Block. */
  attachmentLabels: Map<string, string>;
  problems: ItemProblem[];
};

/**
 * Setzt aus einer beitrag.md alles zusammen, was die Anzeige braucht.
 *
 * Rein und ohne Dateizugriff, damit der ganze Vertrag zwischen Simon, dem
 * Editor und Claude Code in Unit-Tests festgenagelt werden kann.
 */
export function parseItemMarkdown(
  raw: string,
  context: {
    slug: Slug;
    kind: MediaKind;
    /** Dauer aus der Mediendatei, falls der Kopf keine nennt. */
    fallbackDuration?: number | null;
  },
): ParsedItemMarkdown {
  const split = splitFrontmatter(raw);
  const head = parseItemFrontmatter(split.frontmatterText);

  /*
   * Zwei Töpfe, weil zwei Zählweisen zusammenkommen: der Kopf zählt in der
   * Datei, alle Teil-Parser zählen im Body. Am Ende wird nur der zweite Topf
   * verschoben — siehe lineOffset in ./frontmatter.
   */
  const headProblems: ItemProblem[] = [...split.problems, ...head.problems];
  const problems: ItemProblem[] = [];

  const body = split.body;
  const blockResult = findBlocks(body);
  problems.push(...blockResult.problems);
  const blocks = blockResult.blocks;

  const durationSeconds =
    head.data.durationSeconds ?? context.fallbackDuration ?? null;

  // ------------------------------------------------------------- Kapitel
  let chapters: Chapter[] = [];
  if (context.kind === "text") {
    /*
     * Bei Textbeiträgen sind die Überschriften die Kapitel. Alle Marker-
     * Blöcke werden geleert (nicht entfernt), damit die Zeilennummern der
     * Originaldatei gültig bleiben — die Überschriften im Block
     * "kapitelzusammenfassungen" sind keine Abschnitte des Textes.
     */
    const forSections = blankBlocks(body, blocks);
    const built = buildSectionChapters(parseSectionLines(forSections));
    chapters = built.chapters;
    problems.push(...built.problems);
  } else {
    /*
     * Bei Video und Audio zählen Zeitmarken. Der Block "kapitel" bleibt
     * stehen, alle anderen werden geleert: eine Zeitmarke in einer
     * Kapitelzusammenfassung ist kein eigenes Kapitel.
     */
    const forChapters = blankBlocks(body, blocks, ["kapitel"]);
    const built = buildTimeChapters(parseChapterLines(forChapters), {
      durationSeconds,
    });
    chapters = built.chapters;
    problems.push(...built.problems);
  }

  // --------------------------------------------------- Zusammenfassungen
  const summaryBlock = blocks.get("zusammenfassung");
  const summary = summaryBlock?.inner.trim() ? summaryBlock.inner.trim() : null;

  const chapterSummaryBlock = blocks.get("kapitelzusammenfassungen");
  if (chapterSummaryBlock) {
    const summaries = parseChapterSummaries(
      chapterSummaryBlock.inner,
      chapterSummaryBlock.innerStartLine,
    );
    problems.push(...attachChapterSummaries(chapters, summaries));
  }

  // ---------------------------------------------------------- Bezüge
  const referenceBlock = blocks.get("bezuege");
  const referenceResult = referenceBlock
    ? parseReferenceLines(
        referenceBlock.inner,
        referenceBlock.innerStartLine,
        context.slug,
      )
    : { references: [], problems: [] };
  problems.push(...referenceResult.problems);

  // --------------------------------------------------------- Anhänge
  const attachmentBlock = blocks.get("anhaenge");
  const attachmentLabels = attachmentBlock
    ? parseAttachmentLabels(attachmentBlock.inner)
    : new Map<string, string>();

  // ----------------------------------------------------- Beschreibung
  const rawDescription = stripBlocks(body, blocks);
  const description = linkifyTimeMentions(rawDescription);

  /*
   * Der Titel: Frontmatter zuerst. Bei Textbeiträgen darf die erste
   * Überschrift der Ebene 1 einspringen — so wird eine importierte
   * Markdown-Datei ohne Kopf richtig benannt. Letzter Rückfall ist der Slug,
   * denn ein Beitrag ohne Titel ist unbrauchbar.
   */
  let title = head.data.title;
  if (!title && context.kind === "text") {
    const h1 = /^ {0,3}#\s+(.+?)\s*#*\s*$/m.exec(rawDescription);
    if (h1) title = h1[1].trim();
  }

  const offset = lineOffset(split);

  return {
    frontmatter: head.data,
    title: title || humanizeSlug(context.slug),
    durationSeconds,
    description,
    rawDescription,
    chapters: shiftSourceLines(chapters, offset),
    summary,
    references: shiftSourceLines(referenceResult.references, offset),
    attachmentLabels,
    problems: [...headProblems, ...shiftProblems(problems, offset)],
  };
}

/**
 * Die Vorlage für eine neue beitrag.md. Alle Marker-Blöcke sind schon da,
 * damit Mensch und Claude Code dieselbe Struktur vorfinden. Das Beispiel für
 * das Kapitelformat steht als Kommentar drin und ist deshalb selbst kein
 * Kapitel.
 */
export function renderItemMarkdown(input: {
  title: string;
  kind: MediaKind;
  recorded?: string | null;
  durationSeconds?: number | null;
  tags?: readonly string[];
}): string {
  const head: string[] = ["---", `titel: ${yamlString(input.title)}`];
  head.push(
    input.tags && input.tags.length > 0
      ? `schlagworte: [${input.tags.join(", ")}]`
      : "schlagworte: []",
  );
  if (input.recorded) head.push(`aufgenommen: ${input.recorded}`);
  if (input.durationSeconds && input.durationSeconds > 0) {
    head.push(`dauer: ${formatDurationForFrontmatter(input.durationSeconds)}`);
  }
  head.push("---", "");

  const body: string[] = [];
  if (input.kind === "text") {
    body.push("Hier steht der Text.", "");
  } else {
    body.push("Worum es in diesem Beitrag geht.", "");
    body.push(
      "<!-- Kapitel: eine Zeile je Kapitel, Zeit und Titel.",
      "     Unter einer Stunde MM:SS, ab einer Stunde H:MM:SS.",
      "         00:00 Einleitung",
      "         01:24 Akku prüfen -->",
      "",
    );
    body.push("<!-- kapitel:start -->", "<!-- kapitel:ende -->", "");
  }

  body.push(
    "<!-- zusammenfassung:start -->",
    "<!-- zusammenfassung:ende -->",
    "",
  );
  if (input.kind !== "text") {
    body.push(
      "<!-- kapitelzusammenfassungen:start -->",
      "<!-- kapitelzusammenfassungen:ende -->",
      "",
    );
  }
  body.push("<!-- bezuege:start -->", "<!-- bezuege:ende -->", "");

  return `${head.join("\n")}${body.join("\n")}`;
}

/** Nur zitieren, wenn YAML es braucht — von Hand gelesene Dateien bleiben lesbar. */
export function yamlString(value: string): string {
  const needsQuotes =
    /^[\s>|&*!%@`'"[{]/.test(value) ||
    /:\s/.test(value) ||
    /\s$/.test(value) ||
    value === "";
  if (!needsQuotes) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Die Dauer wird in Anführungszeichen geschrieben. In YAML 1.2 wäre das nicht
 * nötig, aber so kann auch ein Werkzeug, das noch YAML 1.1 liest, aus
 * 00:42:15 keine Zahl machen.
 */
function formatDurationForFrontmatter(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `"${pad(h)}:${pad(m)}:${pad(s)}"`;
}
