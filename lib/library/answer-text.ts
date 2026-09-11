import { findWikilinks } from "./wikilink";
import type { LinkTarget, Slug } from "./types";

/*
 * Eine Antwort in ihre Bestandteile zerlegen: Text, Verweise in die
 * Mediathek, Adressen ins Netz.
 *
 * Der Punkt der ganzen Übung: ein Beleg wie [[cloud-compare-1#04:25]] soll
 * anklickbar sein und das Video an genau dieser Stelle öffnen. Eine Antwort,
 * die „siehe cloud-compare-1 bei 04:25" sagt, ist eine Hausaufgabe; ein Link
 * ist eine Antwort.
 *
 * Zurück kommen STÜCKE, kein HTML. Bibliotheksinhalte sind Fremdtext — hier
 * schreibt ein Sprachmodell —, und `dangerouslySetInnerHTML` verbietet sich
 * dafür. Dieselbe Festlegung wie bei den Suchauszügen.
 */

export type AnswerPiece =
  | { kind: "text"; text: string }
  | { kind: "verweis"; slug: Slug; target: LinkTarget; raw: string }
  | { kind: "web"; url: string };

/*
 * Adressen im Fließtext. Der abschließende Satzpunkt gehört nicht dazu —
 * „… auf https://example.org/seite." wäre sonst ein Link auf "seite."
 */
const URL_MUSTER = /https?:\/\/[^\s<>"'()[\]{}]+/g;
const ENDZEICHEN = /[.,;:!?»"']+$/;

/** Zerlegt einen Antworttext in Text, Verweise und Adressen. */
export function splitAnswer(text: string): AnswerPiece[] {
  type Fund = { start: number; end: number; piece: AnswerPiece };
  const funde: Fund[] = [];

  for (const link of findWikilinks(text)) {
    funde.push({
      start: link.index,
      end: link.index + link.length,
      piece: {
        kind: "verweis",
        slug: link.slug,
        target: link.target,
        raw: link.raw,
      },
    });
  }

  URL_MUSTER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_MUSTER.exec(text)) !== null) {
    const roh = match[0];
    const url = roh.replace(ENDZEICHEN, "");
    if (!url) continue;
    funde.push({
      start: match.index,
      end: match.index + url.length,
      piece: { kind: "web", url },
    });
  }

  funde.sort((a, b) => a.start - b.start);

  const pieces: AnswerPiece[] = [];
  let cursor = 0;
  for (const fund of funde) {
    // Überlappungen kann es geben (eine Adresse in doppelten Klammern).
    if (fund.start < cursor) continue;
    if (fund.start > cursor) {
      pieces.push({ kind: "text", text: text.slice(cursor, fund.start) });
    }
    pieces.push(fund.piece);
    cursor = fund.end;
  }
  if (cursor < text.length) {
    pieces.push({ kind: "text", text: text.slice(cursor) });
  }

  return pieces;
}

/**
 * Beschriftung eines Verweises: der Titel des Beitrags, dazu die Stelle.
 *
 * Ohne Titel (der Beitrag fehlt) bleibt die Kennung stehen — dann sieht man
 * wenigstens, worauf sich die Antwort beruft.
 */
export function referenceLabel(
  slug: Slug,
  target: LinkTarget,
  title: string | undefined,
  formatTime: (seconds: number) => string,
): string {
  const name = title ?? slug;
  switch (target.kind) {
    case "ganz":
      return name;
    case "abschnitt":
      return `${name} — ${target.anchor.replace(/-/g, " ")}`;
    case "zeit":
      return `${name} ${formatTime(target.start)}`;
  }
}
