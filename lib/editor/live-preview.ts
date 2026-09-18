import { formatTimecode, markCodeLines, parseChapterLines } from "@/lib/library/chapters";
import { splitFrontmatter } from "@/lib/library/frontmatter";
import { blankBlocks, findBlocks, matchBlockMarker } from "@/lib/library/sections";
import type { BlockName } from "@/lib/library/sections";
import type { LinkTarget, MediaKind } from "@/lib/library/types";

/*
 * Sagt für jede Zeile einer beitrag.md, wie der Live-Vorschau-Editor sie
 * behandeln soll — nicht WIE sie gezeichnet wird (das ist Sache der
 * CodeMirror-Erweiterung), sondern WAS sie ist.
 *
 * Bewusst getrennt von components/editor/live-preview-editor.tsx: diese
 * Datei fasst nur die schon vorhandenen, getesteten Parser
 * (chapters.ts, sections.ts, frontmatter.ts) zusammen, damit der Editor
 * dieselbe Vorstellung von "Kapitelzeile" oder "Marker" hat wie der Rest der
 * Mediathek — nie eine eigene, zweite Grammatik.
 */

export type LivePreviewLine =
  | { type: "frontmatter" }
  | { type: "code" }
  | { type: "marker"; label: string }
  | { type: "chapter"; time: string; title: string }
  | { type: "heading"; level: 1 | 2 | 3 | 4 };

const BLOCK_LABELS: Record<BlockName, string> = {
  kapitel: "Kapitel",
  zusammenfassung: "Zusammenfassung",
  kapitelzusammenfassungen: "Kapitel-Zusammenfassungen",
  bezuege: "Bezüge",
  anhaenge: "Anhänge",
  fundstellen: "Fundstellen",
  antwort: "Antwort",
};

function markerLabel(name: BlockName, isStart: boolean): string {
  return `${BLOCK_LABELS[name]} ${isStart ? "beginnt" : "endet"}`;
}

/**
 * Für jede Zeile der Datei (1-basiert), was der Editor daraus macht. Fehlt
 * ein Eintrag, ist die Zeile gewöhnlicher Fließtext — dafür übernimmt die
 * CodeMirror-Erweiterung selbst die Inline-Erkennung (Fett, Kursiv,
 * Wikilinks), weil das reine, ungeprüfte Markdown-Syntax ist und keine
 * eigene Grammatik der Mediathek.
 */
export function analyzeLivePreviewLines(
  content: string,
  kind: MediaKind,
  durationSeconds: number | null,
): Map<number, LivePreviewLine> {
  const result = new Map<number, LivePreviewLine>();
  const split = splitFrontmatter(content);
  const offset = split.bodyStartLine - 1;

  for (let line = 1; line < split.bodyStartLine; line += 1) {
    result.set(line, { type: "frontmatter" });
  }

  const { blocks } = findBlocks(split.body);
  for (const block of blocks.values()) {
    result.set(block.openLine + offset, {
      type: "marker",
      label: markerLabel(block.name, true),
    });
    result.set(block.closeLine + offset, {
      type: "marker",
      label: markerLabel(block.name, false),
    });
  }

  if (kind !== "text") {
    const forChapters = blankBlocks(split.body, blocks, ["kapitel"]);
    const forceHours = (durationSeconds ?? 0) >= 3600;
    for (const entry of parseChapterLines(forChapters)) {
      result.set(entry.line + offset, {
        type: "chapter",
        time: formatTimecode(entry.start, { forceHours }),
        title: entry.title,
      });
    }
  }

  const bodyLines = split.body.split("\n");
  const inCode = markCodeLines(bodyLines);
  for (let i = 0; i < bodyLines.length; i += 1) {
    const fileLine = i + 1 + offset;
    if (result.has(fileLine)) continue;

    // Ein Marker, der (noch) nicht Teil eines vollständigen Paars ist —
    // etwa während er gerade getippt wird — bekommt trotzdem sein Banner.
    const marker = matchBlockMarker(bodyLines[i]);
    if (marker) {
      result.set(fileLine, {
        type: "marker",
        label: markerLabel(marker.name, marker.isStart),
      });
      continue;
    }

    if (inCode[i]) {
      result.set(fileLine, { type: "code" });
      continue;
    }

    const heading = /^ {0,3}(#{1,6})\s+\S.*$/.exec(bodyLines[i]);
    if (heading) {
      const level = Math.min(4, heading[1].length) as 1 | 2 | 3 | 4;
      result.set(fileLine, { type: "heading", level });
    }
  }

  return result;
}

/** Die Kurzform eines Wikilinks, wie sie dekoriert im Editor steht. */
export function wikilinkLabel(slug: string, target: LinkTarget): string {
  switch (target.kind) {
    case "ganz":
      return slug;
    case "abschnitt":
      return `${slug} · ${target.anchor}`;
    case "zeit":
      return target.end === null
        ? `${slug} · ${formatTimecode(target.start)}`
        : `${slug} · ${formatTimecode(target.start)}–${formatTimecode(target.end)}`;
  }
}
