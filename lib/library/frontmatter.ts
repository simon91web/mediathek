import { parse as parseYaml } from "yaml";

import { parseTimecode } from "./chapters";
import type { ItemProblem, MediaKind } from "./types";

/*
 * Frontmatter-Schlüssel sind deutsch, weil Simon sie tippt und Kollegen sie
 * lesen. Englische Varianten werden als Alias akzeptiert — eine von Claude
 * Code oder aus einem anderen Werkzeug importierte Datei soll nicht scheitern.
 *
 * Gelesen wird mit `yaml` v2 (YAML 1.2 core), NICHT mit gray-matter/js-yaml:
 * dort wäre `dauer: 00:42:15` eine sexagesimale Zahl (2535) und
 * `aufgenommen: 2026-04-17` ein zeitzonenbehaftetes Date. Beides ist stiller
 * Datenverlust. YAML 1.2 liefert Strings, und wir wandeln selbst und
 * nachvollziehbar um.
 */

export type SplitResult = {
  /** null heißt: keine Frontmatter gefunden, `body` ist die ganze Datei. */
  frontmatterText: string | null;
  body: string;
  /** Zeile, in der der Body beginnt (1-basiert) — für Fehlermeldungen. */
  bodyStartLine: number;
  problems: ItemProblem[];
};

/** UTF-8-BOM entfernen und Zeilenenden vereinheitlichen. */
export function normalizeText(text: string): string {
  // U+FEFF (BOM) am Dateianfang entfernen: Windows-Editoren schreiben es,
  // und danach scheitert jeder Zeilen-Regex an der ersten Zeile.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutBom.replace(/\r\n?/g, "\n");
}

/**
 * Trennt den Frontmatter-Zaun vom Rest. Ohne die Normalisierung oben
 * scheitert jeder Zeilen-Regex an einer unter Windows gespeicherten Datei.
 */
export function splitFrontmatter(raw: string): SplitResult {
  const text = normalizeText(raw);
  const problems: ItemProblem[] = [];
  const lines = text.split("\n");

  let first = 0;
  while (first < lines.length && lines[first].trim() === "") first += 1;

  if (first >= lines.length || lines[first].trim() !== "---") {
    return {
      frontmatterText: null,
      body: text,
      bodyStartLine: 1,
      problems,
    };
  }

  if (first > 0) {
    problems.push({
      kind: "frontmatter",
      message:
        "Vor dem Kopf der Datei stehen Leerzeilen. Das funktioniert, " +
        'aber "---" sollte in der ersten Zeile stehen.',
      line: 1,
    });
  }

  for (let i = first + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "---" || trimmed === "...") {
      return {
        frontmatterText: lines.slice(first + 1, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
        bodyStartLine: i + 2,
        problems,
      };
    }
  }

  // Zaun geöffnet, aber nie geschlossen: nichts wegwerfen.
  problems.push({
    kind: "frontmatter",
    message:
      'Der Kopf der Datei wird nicht geschlossen — es fehlt eine Zeile "---". ' +
      "Der gesamte Text wird als Inhalt behandelt.",
    line: first + 1,
  });
  return {
    frontmatterText: null,
    body: text,
    bodyStartLine: 1,
    problems,
  };
}

/*
 * Zeilennummern: die Teil-Parser rechnen im Body, der Nutzer liest in der
 * Datei.
 *
 * `chapters.ts`, `sections.ts` und `wikilink.ts` bekommen den Text NACH dem
 * Frontmatter-Zaun übergeben und zählen darin ab 1. Das ist richtig so —
 * ihre tabellengetriebenen Tests hängen daran, und sie wissen nichts von
 * einem Kopf. Nur ist eine so gezählte Zeile keine, die man in einem Editor
 * anspringen kann: jede beitrag.md hat einen Kopf, und die Meldung zeigte
 * genau um dessen Höhe zu weit nach oben.
 *
 * Deshalb wird EINMAL am Ende verschoben — in `beitrag-md.ts`, `topics.ts`
 * und `collections.ts`, dort, wo die Teilergebnisse zusammenlaufen.
 *
 * Nicht mitverschoben werden die Hinweise aus `splitFrontmatter` und
 * `parseItemFrontmatter`: die zählen von Anfang an in der Datei.
 */

/** Der Versatz zwischen Body- und Dateizeilen. */
export function lineOffset(split: Pick<SplitResult, "bodyStartLine">): number {
  return split.bodyStartLine - 1;
}

/** Body-bezogene Hinweise auf die Datei umrechnen. */
export function shiftProblems(
  problems: readonly ItemProblem[],
  offset: number,
): ItemProblem[] {
  if (offset === 0) return [...problems];
  return problems.map((problem) =>
    problem.line === undefined
      ? problem
      : { ...problem, line: problem.line + offset },
  );
}

/** Dasselbe für alles, was eine `sourceLine` trägt: Kapitel, Bezüge, Fundstellen. */
export function shiftSourceLines<T extends { sourceLine: number }>(
  entries: readonly T[],
  offset: number,
): T[] {
  if (offset === 0) return [...entries];
  return entries.map((entry) => ({
    ...entry,
    sourceLine: entry.sourceLine + offset,
  }));
}

export type ItemFrontmatter = {
  title: string | null;
  tags: string[];
  /** "YYYY-MM-DD" oder null. Nie ein Date. */
  recorded: string | null;
  durationSeconds: number | null;
  /** Nur setzen, wenn die Ableitung aus der Datei überstimmt werden soll. */
  kind: MediaKind | null;
  /** Dateiname einer bevorzugten Web-Fassung (Etappe 2). */
  webVersion: string | null;
  /**
   * Nur auf Themenseiten: andere Wörter für dasselbe. Anders als Schlagworte
   * werden sie NICHT zu Slugs normalisiert — sie werden angezeigt und für
   * die Suche gefaltet, und dabei soll "Zellspannung" nicht zu
   * "zellspannung" verkommen.
   */
  synonyms: string[];
  /** Nur in Sammlungen: macht daraus eine gespeicherte Suche. */
  query: string | null;
  /**
   * Nur in Fragen: dieselbe Frage, anders gestellt. Das Gegenstück zu den
   * Synonymen einer Themenseite — nur dass hier ganze Sätze stehen, weshalb
   * sie nicht am Komma getrennt werden dürfen.
   */
  alsoAsked: string[];
  /** Nur in Fragen: woraus geantwortet wurde ("bibliothek", "web"). */
  sources: string[];
  /** Unbekannte Schlüssel bleiben erhalten, damit nichts verloren geht. */
  extra: Record<string, unknown>;
};

const EMPTY_FRONTMATTER: ItemFrontmatter = {
  title: null,
  tags: [],
  recorded: null,
  durationSeconds: null,
  kind: null,
  webVersion: null,
  synonyms: [],
  query: null,
  alsoAsked: [],
  sources: [],
  extra: {},
};

/** Deutsche Schlüssel zuerst, englische als Alias. */
const KEY_ALIASES: Record<string, keyof ItemFrontmatter> = {
  titel: "title",
  title: "title",
  schlagworte: "tags",
  schlagwoerter: "tags",
  tags: "tags",
  aufgenommen: "recorded",
  datum: "recorded",
  recorded: "recorded",
  date: "recorded",
  dauer: "durationSeconds",
  duration: "durationSeconds",
  art: "kind",
  kind: "kind",
  webfassung: "webVersion",
  webversion: "webVersion",
  synonyme: "synonyms",
  synonyms: "synonyms",
  suche: "query",
  query: "query",
  search: "query",
  frage: "title",
  question: "title",
  begriff: "title",
  term: "title",
  gefragt: "recorded",
  asked: "recorded",
  schreibweisen: "synonyms",
  spellings: "synonyms",
  "auch gefragt": "alsoAsked",
  "auch-gefragt": "alsoAsked",
  varianten: "alsoAsked",
  "also asked": "alsoAsked",
  quellen: "sources",
  sources: "sources",
};

export function normalizeTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTags(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.map((entry) => String(entry))
    : typeof value === "string"
      ? value.split(",")
      : value == null
        ? []
        : [String(value)];
  const seen = new Set<string>();
  for (const entry of raw) {
    const tag = normalizeTag(entry);
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/**
 * Synonyme behalten ihre Schreibweise — sie werden angezeigt. Entdoppelt
 * wird trotzdem ohne Rücksicht auf Groß- und Kleinschreibung, und ein
 * Synonym von zwei Zeichen wäre in der Suche nur Lärm.
 */
function toSynonyms(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.map((entry) => String(entry))
    : typeof value === "string"
      ? value.split(/[,;]/)
      : value == null
        ? []
        : [String(value)];

  const seen = new Map<string, string>();
  for (const entry of raw) {
    const text = entry.trim().replace(/\s+/g, " ");
    if (text.length < 3 || text.length > 60) continue;
    const key = text.toLowerCase();
    if (!seen.has(key)) seen.set(key, text);
  }
  return [...seen.values()].slice(0, 24);
}

/**
 * Andere Formulierungen derselben Frage.
 *
 * Anders als bei den Synonymen wird NICHT am Komma getrennt: hier stehen
 * ganze Sätze, und „Wie lese ich das Protokoll, wenn es leer ist?“ wäre
 * sonst zwei Fragen. Getrennt wird nur, was YAML schon getrennt hat.
 */
function toQuestionList(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.map((entry) => String(entry))
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : value == null
        ? []
        : [String(value)];

  const seen = new Map<string, string>();
  for (const entry of raw) {
    const text = entry
      .trim()
      .replace(/^[-*]\s*/, "")
      .replace(/\s+/g, " ");
    if (text.length < 3 || text.length > 200) continue;
    const key = text.toLowerCase();
    if (!seen.has(key)) seen.set(key, text);
  }
  return [...seen.values()].slice(0, 12);
}

/** Woraus geantwortet wurde. Kleingeschrieben, damit der Vergleich einfach bleibt. */
function toSources(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.map((entry) => String(entry))
    : typeof value === "string"
      ? value.split(/[,;+]/)
      : value == null
        ? []
        : [String(value)];

  const seen = new Set<string>();
  for (const entry of raw) {
    const text = entry.trim().toLowerCase();
    if (text) seen.add(text.slice(0, 24));
  }
  return [...seen].slice(0, 6);
}

/**
 * Kalendertage bleiben Strings. Akzeptiert YYYY-MM-DD und DD.MM.YYYY; kommt
 * doch ein Date herein (fremd erzeugte Datei), wird nur der Tag übernommen.
 */
function toRecorded(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (german) {
    const [, d, m, y] = german;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Akzeptiert hh:mm:ss, mm:ss, reine Sekunden und "42min". */
function toDuration(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? Math.round(value) : null;
  }
  const text = String(value).trim();
  if (!text) return null;

  const timecode = parseTimecode(text);
  if (timecode !== null) return timecode;

  const minutes = /^(\d+(?:[.,]\d+)?)\s*(?:min|minuten|m)$/i.exec(text);
  if (minutes) return Math.round(Number(minutes[1].replace(",", ".")) * 60);

  const seconds = /^(\d+(?:[.,]\d+)?)\s*(?:s|sek|sekunden)?$/i.exec(text);
  if (seconds) {
    const parsed = Number(seconds[1].replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }
  return null;
}

function toKind(value: unknown): MediaKind | null {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (text === "video") return "video";
  if (text === "audio" || text === "ton" || text === "sprachmemo") {
    return "audio";
  }
  if (text === "text" || text === "dokument" || text === "notiz") return "text";
  return null;
}

/**
 * Liest den Kopf tolerant: ein einzelnes kaputtes Feld degradiert auf seinen
 * Standardwert, statt die ganze Datei zu verwerfen. Nur wenn YAML selbst
 * nicht lesbar ist, gibt es einen Hinweis — und der Beitrag bleibt trotzdem
 * benutzbar (Titel wird dann aus dem Slug abgeleitet).
 */
export function parseItemFrontmatter(frontmatterText: string | null): {
  data: ItemFrontmatter;
  problems: ItemProblem[];
} {
  if (frontmatterText === null || frontmatterText.trim() === "") {
    return { data: { ...EMPTY_FRONTMATTER }, problems: [] };
  }

  let raw: unknown;
  try {
    raw = parseYaml(frontmatterText, { merge: true });
  } catch (error) {
    return {
      data: { ...EMPTY_FRONTMATTER },
      problems: [
        {
          kind: "frontmatter",
          message:
            "Der Kopf der Datei ist kein gültiges YAML: " +
            (error instanceof Error ? error.message : String(error)),
          line: 1,
        },
      ],
    };
  }

  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      data: { ...EMPTY_FRONTMATTER },
      problems: [
        {
          kind: "frontmatter",
          message:
            "Der Kopf der Datei muss eine Liste von Feldern sein " +
            '(zum Beispiel "titel: Mein Beitrag").',
          line: 1,
        },
      ],
    };
  }

  const problems: ItemProblem[] = [];
  const data: ItemFrontmatter = { ...EMPTY_FRONTMATTER, extra: {} };

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const mapped = KEY_ALIASES[key.trim().toLowerCase()];
    if (!mapped) {
      data.extra[key] = value;
      continue;
    }
    switch (mapped) {
      case "title": {
        const title = String(value ?? "").trim();
        if (title) data.title = title;
        break;
      }
      case "tags":
        data.tags = toTags(value);
        break;
      case "recorded": {
        const recorded = toRecorded(value);
        if (recorded === null && value != null && String(value).trim() !== "") {
          problems.push({
            kind: "frontmatter",
            message:
              `Das Datum "${String(value)}" wurde nicht verstanden. ` +
              "Erwartet wird 2026-04-17 oder 17.04.2026.",
          });
        }
        data.recorded = recorded;
        break;
      }
      case "durationSeconds": {
        const duration = toDuration(value);
        if (duration === null && value != null && String(value).trim() !== "") {
          problems.push({
            kind: "frontmatter",
            message:
              `Die Dauer "${String(value)}" wurde nicht verstanden. ` +
              'Erwartet wird "00:42:15", "42min" oder eine Sekundenzahl.',
          });
        }
        data.durationSeconds = duration;
        break;
      }
      case "kind": {
        const kind = toKind(value);
        if (kind === null && value != null && String(value).trim() !== "") {
          problems.push({
            kind: "frontmatter",
            message:
              `Die Art "${String(value)}" ist unbekannt. ` +
              "Erlaubt sind video, audio und text.",
          });
        }
        data.kind = kind;
        break;
      }
      case "synonyms":
        data.synonyms = toSynonyms(value);
        break;
      case "query": {
        const text = String(value ?? "").trim();
        if (text) data.query = text.slice(0, 200);
        break;
      }
      case "alsoAsked":
        data.alsoAsked = toQuestionList(value);
        break;
      case "sources":
        data.sources = toSources(value);
        break;
      case "webVersion": {
        const name = String(value ?? "").trim();
        // Nur ein Dateiname, kein Pfad — sonst wäre das ein Ausbruch.
        if (name && !/[\\/]/.test(name) && !name.startsWith(".")) {
          data.webVersion = name;
        } else if (name) {
          problems.push({
            kind: "frontmatter",
            message:
              `Die Web-Fassung "${name}" muss ein einfacher Dateiname im ` +
              "Beitragsordner sein.",
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return { data, problems };
}
