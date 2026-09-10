import { slugify } from "./slug";
import type {
  Chapter,
  ItemProblem,
  SectionChapter,
  TimeChapter,
} from "./types";

/*
 * Kapitel stehen im Markdown-Body, genau wie in einer YouTube-Beschreibung.
 * Handtippen, der Editor-Knopf und Claude Code schreiben dasselbe Format —
 * es gibt keinen zweiten Ort, an dem Kapitel gepflegt würden.
 *
 * Bei Textbeiträgen gibt es keine Zeitachse; dort werden die Überschriften
 * des Textes zu Kapiteln, mit einem Anker als Sprungziel.
 */

// ---------------------------------------------------------------- Zeitcodes

/**
 * Erlaubt sind m:ss, mm:ss, h:mm:ss und hh:mm:ss.
 *
 * Bei zwei Teilen darf der Minutenteil über 59 liegen ("95:12" = 1 h 35 min
 * 12 s) — so schreiben Leute lange Aufnahmen tatsächlich auf. Bei drei Teilen
 * müssen Minuten und Sekunden je zweistellig und höchstens 59 sein.
 *
 * Die Sekunden sind IMMER exakt zweistellig: "1:2:3" ist keine Zeit, sondern
 * Text. Ohne diese Strenge wird jede Versionsnummer zum Kapitel.
 */
const TIMECODE_PATTERN = /^(?:(\d{1,2}):(\d{2})|(\d{1,3})):([0-5]\d)$/;

/** Sekunden aus einem Zeitcode, oder null wenn die Zeichenkette keiner ist. */
export function parseTimecode(raw: string): number | null {
  const match = TIMECODE_PATTERN.exec(raw.trim());
  if (!match) return null;
  const [, h, m, mOnly, s] = match;
  const seconds = Number(s);
  if (mOnly !== undefined) {
    // Zweiteilig: mm:ss, Minuten dürfen groß sein.
    return Number(mOnly) * 60 + seconds;
  }
  // Dreiteilig: h:mm:ss.
  const minutes = Number(m);
  if (minutes > 59) return null;
  return Number(h) * 3600 + minutes * 60 + seconds;
}

/**
 * Sekunden als Zeitcode. Unter einer Stunde MM:SS, ab einer Stunde H:MM:SS —
 * dieselbe Schreibweise, die der Parser wieder einliest.
 */
export function formatTimecode(
  seconds: number,
  opts: { forceHours?: boolean } = {},
): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0 || opts.forceHours) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/** WebVTT verlangt HH:MM:SS.mmm. */
function formatVttTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

// ------------------------------------------------------- Zeilen einer Datei

/**
 * Markiert Zeilen, die in einem Codeblock liegen. Ohne das wird ein
 * Beispiel-Schnipsel in der Beschreibung zum Kapitel.
 *
 * Erkannt werden umzäunte Blöcke (``` und ~~~) sowie Zeilen mit vier oder
 * mehr Leerzeichen Einrückung (in Markdown ein Codeblock).
 */
function markCodeLines(lines: readonly string[]): boolean[] {
  const inCode = new Array<boolean>(lines.length).fill(false);
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) {
        fence = marker;
        inCode[i] = true;
        continue;
      }
      if (fence === marker) {
        inCode[i] = true;
        fence = null;
        continue;
      }
    }
    if (fence !== null) {
      inCode[i] = true;
      continue;
    }
    if (/^(\t| {4,})\S/.test(line)) inCode[i] = true;
  }
  return inCode;
}

/**
 * Aufzählungs-, Zitat- und Nummerierungszeichen vor der Zeit. Fett (**) wird
 * mitgenommen, weil "**01:24 Akku**" eine verbreitete Schreibweise ist — und
 * muss vor dem einzelnen Sternchen stehen, sonst bliebe eines davon stehen.
 */
const LINE_PREFIX = /^(?:\*\*|[-*•>]|\d{1,3}[.)])\s*/;

/**
 * Zwischen Zeit und Titel: ein Trennzeichen mit optionalem Leerraum, oder
 * einfach Leerraum. Der Halbgeviert- und der Geviertstrich sind dabei, weil
 * Textverarbeitungen den einfachen Bindestrich gern ersetzen.
 *
 * Die Trennzeichen-Alternative steht ZUERST: andernfalls verschluckt `\s+`
 * nur das Leerzeichen davor und der Strich landet im Titel.
 */
const SEPARATOR = /^(?:\s*[-–—:|·]+\s*|\s+)/;

/** Die Zeit selbst, optional in eckigen oder runden Klammern. */
const LEADING_TIME = /^(?:\[([^\]]{3,12})\]|\(([^)]{3,12})\)|(\d{1,3}:\d{2}(?::\d{2})?))/;

export type ParsedChapterLine = {
  start: number;
  title: string;
  /** 1-basiert. */
  line: number;
  raw: string;
};

/**
 * Findet Kapitelzeilen im Body. Die Zeit muss am Zeilenanfang stehen (nach
 * optionalem Aufzählungszeichen) — "Bei 01:24 prüfen wir den Akku" ist
 * ausdrücklich kein Kapitel. Solche Zeitmarken werden über findTimeMentions()
 * trotzdem klickbar, genau wie bei YouTube.
 */
export function parseChapterLines(body: string): ParsedChapterLine[] {
  const lines = body.split("\n");
  const inCode = markCodeLines(lines);
  const found: ParsedChapterLine[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (inCode[i]) continue;
    const raw = lines[i];
    // Bis zu drei Leerzeichen Einrückung sind erlaubt, vier wären Code.
    let rest = raw.replace(/^ {0,3}/, "").trimEnd();
    if (!rest) continue;
    // Überschriften sind keine Kapitelzeilen.
    if (/^#{1,6}\s/.test(rest)) continue;

    rest = rest.replace(LINE_PREFIX, "");
    const timeMatch = LEADING_TIME.exec(rest);
    if (!timeMatch) continue;

    const timeText = timeMatch[1] ?? timeMatch[2] ?? timeMatch[3] ?? "";
    const start = parseTimecode(timeText);
    if (start === null) continue;

    rest = rest.slice(timeMatch[0].length);
    const sepMatch = SEPARATOR.exec(rest);
    // Ohne Trenner und ohne Titel ist es nur eine nackte Zeitangabe.
    if (!sepMatch) continue;

    let title = rest.slice(sepMatch[0].length).trim();
    // Abschließendes Fett aus "**01:24 Akku**" wieder entfernen.
    title = title.replace(/\*\*$/, "").trim();
    if (!title) continue;

    found.push({ start, title, line: i + 1, raw });
  }

  return found;
}

/**
 * Baut aus den gefundenen Zeilen die Kapitelliste.
 *
 * `durationSeconds` darf null sein — die echte Dauer kennt erst der Player.
 * Deshalb bleibt das Ende des letzten Kapitels dann offen.
 */
export function buildTimeChapters(
  lines: readonly ParsedChapterLine[],
  opts: { durationSeconds: number | null },
): { chapters: TimeChapter[]; problems: ItemProblem[] } {
  const problems: ItemProblem[] = [];
  // Stabil sortieren: bei gleicher Zeit gewinnt die zuerst geschriebene Zeile.
  const sorted = [...lines].sort((a, b) =>
    a.start === b.start ? a.line - b.line : a.start - b.start,
  );

  const kept: ParsedChapterLine[] = [];
  for (const entry of sorted) {
    const previous = kept[kept.length - 1];
    if (previous && previous.start === entry.start) {
      problems.push({
        kind: "kapitel",
        message:
          `Bei ${formatTimecode(entry.start)} stehen zwei Kapitel ` +
          `("${previous.title}" und "${entry.title}"). Das zweite wird ignoriert.`,
        line: entry.line,
      });
      continue;
    }
    kept.push(entry);
  }

  const duration = opts.durationSeconds;
  const chapters = kept.map((entry, index): TimeChapter => {
    const next = kept[index + 1];
    const beyondEnd = duration !== null && entry.start >= duration;
    if (beyondEnd) {
      problems.push({
        kind: "kapitel",
        message:
          `Kapitel bei ${formatTimecode(entry.start)} liegt hinter dem Ende ` +
          `${formatTimecode(duration)} — ist die Datei neu geschnitten?`,
        line: entry.line,
      });
    }
    return {
      kind: "zeit",
      index,
      start: entry.start,
      end: next ? next.start : duration,
      title: entry.title,
      sourceLine: entry.line,
      summary: null,
      beyondEnd,
    };
  });

  return { chapters, problems };
}

// ---------------------------------------------- Abschnitte in Textbeiträgen

export type ParsedSectionLine = {
  level: 2 | 3;
  title: string;
  line: number;
};

/**
 * Überschriften der Ebene 2 und 3 eines Textbeitrags. Ebene 1 bleibt außen
 * vor: die ist der Titel des Dokuments, kein Abschnitt darin.
 */
export function parseSectionLines(body: string): ParsedSectionLine[] {
  const lines = body.split("\n");
  const inCode = markCodeLines(lines);
  const found: ParsedSectionLine[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (inCode[i]) continue;
    const match = /^ {0,3}(#{2,3})\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (!match) continue;
    const level = match[1].length === 2 ? 2 : 3;
    const title = match[2].trim();
    if (!title) continue;
    found.push({ level, title, line: i + 1 });
  }

  return found;
}

/**
 * Anker aus den Überschriften. Verwendet dieselbe slugify() wie die
 * Ordnernamen, damit ein Anker vorhersagbar ist und Claude Code ihn ohne
 * Nachschlagen schreiben kann. Doppelte Titel bekommen "-2", "-3", …
 */
export function buildSectionChapters(
  lines: readonly ParsedSectionLine[],
): { chapters: SectionChapter[]; problems: ItemProblem[] } {
  const used = new Map<string, number>();
  const chapters = lines.map((entry, index): SectionChapter => {
    const base = slugify(entry.title);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return {
      kind: "abschnitt",
      index,
      anchor: seen === 0 ? base : `${base}-${seen + 1}`,
      level: entry.level,
      title: entry.title,
      sourceLine: entry.line,
      summary: null,
    };
  });
  return { chapters, problems: [] };
}

// ------------------------------------------------- Zeitmarken im Fließtext

export type TimeMention = {
  start: number;
  /** Zeichenoffset im übergebenen Text. */
  index: number;
  length: number;
  text: string;
};

/**
 * Jede Zeitmarke im Text, auch mitten im Satz. Grundlage dafür, dass "wie ab
 * 12:40 gezeigt" anklickbar wird, ohne ein Kapitel zu sein.
 */
export function findTimeMentions(text: string): TimeMention[] {
  const mentions: TimeMention[] = [];
  const pattern = /(?<![\d:])(\d{1,3}:\d{2}(?::\d{2})?)(?![\d:])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = parseTimecode(match[1]);
    if (start === null) continue;
    mentions.push({
      start,
      index: match.index,
      length: match[1].length,
      text: match[1],
    });
  }
  return mentions;
}

/**
 * Schreibt Zeitmarken zu Markdown-Links um: "01:24" wird "[01:24](#t=84)".
 *
 * Damit bleibt das Markdown-Rendern komplett auf dem Server; im Client fängt
 * ein dünner Wrapper die Klicks per Event-Delegation ab. Kein
 * dangerouslySetInnerHTML, und ohne JavaScript ist der Link nur wirkungslos
 * statt kaputt.
 *
 * Ausgenommen sind Codeblöcke, bestehende Links und Wikilinks — dort wäre
 * eine Ersetzung entweder falsch oder zerstörend.
 */
export function linkifyTimeMentions(markdown: string): string {
  const lines = markdown.split("\n");
  const inCode = markCodeLines(lines);

  return lines
    .map((line, i) => {
      if (inCode[i]) return line;
      if (!/\d:\d{2}/.test(line)) return line;

      // Bereiche, die unangetastet bleiben: Inline-Code, Links, Wikilinks.
      const guarded: Array<[number, number]> = [];
      for (const pattern of [
        /`[^`]*`/g,
        /\[\[[^\]]*\]\]/g,
        /\[[^\]]*\]\([^)]*\)/g,
      ]) {
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(line)) !== null) {
          guarded.push([m.index, m.index + m[0].length]);
        }
      }
      const isGuarded = (from: number, to: number) =>
        guarded.some(([g0, g1]) => from < g1 && to > g0);

      const mentions = findTimeMentions(line).filter(
        (mention) => !isGuarded(mention.index, mention.index + mention.length),
      );
      if (mentions.length === 0) return line;

      let out = "";
      let cursor = 0;
      for (const mention of mentions) {
        out += line.slice(cursor, mention.index);
        out += `[${mention.text}](#t=${mention.start})`;
        cursor = mention.index + mention.length;
      }
      return out + line.slice(cursor);
    })
    .join("\n");
}

// --------------------------------------------------------- Player-Hilfsmittel

/**
 * Kapitel als WebVTT, für den Chapters-Track des Players. Wird im Client
 * erzeugt, sobald die echte Dauer bekannt ist — damit gibt es genau eine
 * Wahrheit (die Kapitelliste aus beitrag.md) und keinen Server-Roundtrip.
 */
export function chaptersToVtt(
  chapters: readonly Chapter[],
  durationSeconds: number | null,
): string {
  const timed = chapters.filter(
    (chapter): chapter is TimeChapter =>
      chapter.kind === "zeit" && !chapter.beyondEnd,
  );
  if (timed.length === 0) return "WEBVTT\n";

  const lines: string[] = ["WEBVTT", ""];
  timed.forEach((chapter, index) => {
    const next = timed[index + 1];
    const fallbackEnd = chapter.end ?? durationSeconds;
    const end = next
      ? next.start
      : // Ohne bekannte Dauer eine Stunde ansetzen; der Player korrigiert das
        // Segment, sobald er die echte Länge kennt.
        (fallbackEnd ?? chapter.start + 3600);
    if (end <= chapter.start) return;
    lines.push(String(index + 1));
    lines.push(`${formatVttTime(chapter.start)} --> ${formatVttTime(end)}`);
    lines.push(chapter.title);
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * Index des Kapitels, in dem die Zeit liegt; -1 wenn davor. Binärsuche, damit
 * der Aufruf auch bei einem Transkript mit tausenden Segmenten billig bleibt.
 */
export function activeChapterIndex(
  starts: readonly number[],
  time: number,
): number {
  let low = 0;
  let high = starts.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (starts[mid] <= time) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}
