import { foldTerm } from "@/lib/search/normalize";
import { isSlug } from "./slug";
import type {
  Befund,
  BefundKategorie,
  Item,
  ItemProblem,
  PerspektiveErgebnis,
  Slug,
  Spot,
  Stufe,
  ThemaVollstaendigkeit,
  Topic,
  UnverorteterFaden,
  Vollstaendigkeit,
} from "./types";
import { findWikilinks } from "./wikilink";

/*
 * Lose Enden finden — zwei getrennte Prüfungen, aus einem Grund:
 *
 * "Fachfremd" fragt nach Breite (steht überhaupt genug da, kommt jedes
 * Synonym irgendwo vor) und lässt sich aus dem, was ohnehin geladen ist,
 * berechnen — kein Modellaufruf, kein Risiko, immer aktuell.
 *
 * "Fachkundig" fragt nach Tiefe und Präzision (Widerspruch, unbelegte Zahl,
 * nur der Normalfall, ein Verweis, der nie beantwortet wurde) — das kann nur
 * ein Sprachmodell beurteilen, das die Beiträge selbst liest. Damit es dabei
 * nicht sein eigenes Weltwissen über UNITECHNICS-Spezifika einmischt, prüft
 * es NUR Widersprüche INNERHALB der Bibliothek, nie "ist das objektiv
 * richtig" — und jeder Befund braucht mindestens einen Beleg. Ein Befund ohne
 * Beleg wird beim Einlesen verworfen, nie stillschweigend übernommen.
 *
 * Deshalb bleibt Fachkundig "ungeprueft", bis `analysen/vollstaendigkeit.md`
 * einmal erzeugt wurde (Auftrag "Lücken analysieren") — eine ehrliche Lücke
 * ist besser als eine erfundene Stufe.
 */

const CATEGORY_HEADINGS: Record<string, BefundKategorie> = {
  Widerspruch: "widerspruch",
  "Unbelegte Zahl": "unbelegte-zahl",
  "Nur Normalfall behandelt": "nur-normalfall",
  "Offener Verweis": "offener-verweis",
};

function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianUmfang(topics: readonly Topic[]): number {
  const werte = topics
    .map((topic) => topic.itemSlugs.length + topic.spots.length)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  return median(werte);
}

function containsFolded(haystack: string, needle: string): boolean {
  const term = needle.trim();
  if (!term) return false;
  return foldTerm(haystack).includes(foldTerm(term));
}

/**
 * Fachfremd, live berechnet: keine Beschreibung, ein Synonym, das nirgends
 * vorkommt, oder auffällig wenig Umfang gegenüber den übrigen Themen.
 *
 * Der Textvorrat bleibt bewusst auf das beschränkt, was ohnehin geladen ist
 * (Beschreibung, Fundstellen-Notizen, Kapiteltitel und -zusammenfassungen der
 * verlinkten Beiträge) — nicht die vollen Transkripte, die lägen erst auf der
 * Platte und wären hier ein teurer Zusatzzugriff.
 */
export function computeDeterministicFindings(
  topics: readonly Topic[],
  itemsBySlug: ReadonlyMap<Slug, Item>,
): Map<Slug, Befund[]> {
  const result = new Map<Slug, Befund[]>();
  const median_ = medianUmfang(topics);

  for (const topic of topics) {
    const befunde: Befund[] = [];

    if (!topic.description.trim()) {
      befunde.push({
        kategorie: "keine-beschreibung",
        text: "Dieses Thema hat noch keine kurze Beschreibung.",
        belege: [],
      });
    }

    const textPool = [
      topic.description,
      ...topic.spots.map((spot) => spot.note),
      ...topic.itemSlugs
        .map((slug) => itemsBySlug.get(slug))
        .filter((item): item is Item => item !== undefined)
        .flatMap((item) => [
          item.description,
          ...item.chapters.map((chapter) => chapter.title),
          ...item.chapters.map((chapter) => chapter.summary ?? ""),
        ]),
    ].join("\n");

    for (const synonym of topic.synonyms) {
      if (!containsFolded(textPool, synonym)) {
        befunde.push({
          kategorie: "synonym-ohne-fundstelle",
          text: `Das Synonym „${synonym}" kommt in keiner Fundstelle, Beschreibung oder einem verlinkten Beitrag vor.`,
          belege: [],
        });
      }
    }

    const umfang = topic.itemSlugs.length + topic.spots.length;
    if (umfang === 0) {
      befunde.push({
        kategorie: "wenige-fundstellen",
        text: "Dieses Thema hat weder Beiträge noch Fundstellen.",
        belege: [],
      });
    } else if (median_ > 0 && umfang < median_ * 0.5) {
      befunde.push({
        kategorie: "wenige-fundstellen",
        text: `Auffällig wenig Umfang: ${umfang} gegenüber median ${median_} bei den übrigen Themen.`,
        belege: [],
      });
    }

    result.set(topic.slug, befunde);
  }

  return result;
}

export function deriveStufeFachfremd(
  anzahlBefunde: number,
  umfang: number,
  medianUmfang: number,
): Stufe {
  if (anzahlBefunde >= 2 || umfang <= 1) return "lueckenhaft";
  if (anzahlBefunde === 1) return "im-aufbau";
  if (medianUmfang > 0 && umfang < medianUmfang) return "im-aufbau";
  if (medianUmfang > 0 && umfang >= medianUmfang * 1.5) return "vertieft";
  return "breit";
}

const RANG: Record<Stufe, number> = {
  ungeprueft: -1,
  lueckenhaft: 0,
  "im-aufbau": 1,
  breit: 2,
  vertieft: 3,
};
const NACH_RANG: readonly Stufe[] = ["lueckenhaft", "im-aufbau", "breit", "vertieft"];

/**
 * Eine Stufe für die ganze Bibliothek aus den Stufen ihrer Themen — der
 * gerundete Durchschnitt, "ungeprueft" ausgenommen. Bewusst kein Minimum:
 * ein einzelnes lückenhaftes Thema soll nicht die ganze Karte auf Rot
 * stellen, wenn der Rest breit ist.
 */
export function aggregateStufe(stufen: readonly Stufe[]): Stufe {
  const bewertet = stufen.filter((stufe) => stufe !== "ungeprueft");
  if (bewertet.length === 0) return "ungeprueft";
  const schnitt =
    bewertet.reduce((summe, stufe) => summe + RANG[stufe], 0) / bewertet.length;
  const index = Math.min(Math.max(Math.round(schnitt), 0), NACH_RANG.length - 1);
  return NACH_RANG[index];
}

export function deriveStufeFachkundig(
  reportVorhanden: boolean,
  themaImBerichtGesehen: boolean,
  anzahlBefunde: number,
): Stufe {
  if (!reportVorhanden || !themaImBerichtGesehen) return "ungeprueft";
  if (anzahlBefunde >= 3) return "lueckenhaft";
  if (anzahlBefunde >= 1) return "im-aufbau";
  return "breit";
}

/** Entfernt alle Wikilinks aus einer Zeile und liefert Text plus Belege. */
function parseBelegeLine(
  text: string,
  sourceLine: number,
): { text: string; belege: Spot[] } | null {
  const links = findWikilinks(text);
  if (links.length === 0) return null;

  let rest = text;
  for (const link of [...links].sort((a, b) => b.index - a.index)) {
    rest = rest.slice(0, link.index) + rest.slice(link.index + link.length);
  }
  rest = rest.replace(/\s+/g, " ").trim();

  const belege: Spot[] = links.map((link) => ({
    slug: link.slug,
    target: link.target,
    note: "",
    sourceLine,
  }));
  return { text: rest, belege };
}

export type ParsedCompletenessReport = {
  geprueftAm: string | null;
  byTopic: Map<Slug, Befund[]>;
  unverorteteFaeden: UnverorteterFaden[];
  problems: ItemProblem[];
};

/**
 * Liest `analysen/vollstaendigkeit.md`. Das Format, normativ:
 *
 *   Zuletzt geprüft: 2026-09-18T14:32:00Z
 *
 *   ## [[balancing]]
 *
 *   ### Widerspruch
 *   - Beitrag A nennt X, Beitrag B nennt Y. [[a#02:10]] [[b#07:45]]
 *
 *   ## Unverortete Fäden
 *
 *   - Kompass-Kalibrierung, in vier Kapiteln erwähnt. [[a#02:10]] [[b#00:45]]
 *
 * Eine Themenüberschrift ohne jede Kategorie darunter ist gültig: sie heißt
 * "geprüft, nichts gefunden" — anders als ein Thema, das im Bericht gar
 * nicht vorkommt (dann bleibt es "ungeprueft"). Genau deshalb steht die
 * Themenüberschrift für sich, ohne auf Kategorien darunter angewiesen zu
 * sein.
 */
export function parseCompletenessReport(raw: string): ParsedCompletenessReport {
  const lines = raw.split("\n");
  const problems: ItemProblem[] = [];
  const byTopic = new Map<Slug, Befund[]>();
  const unverorteteFaeden: UnverorteterFaden[] = [];
  let geprueftAm: string | null = null;

  type Section =
    | { kind: "none" }
    | { kind: "topic"; slug: Slug; kategorie: BefundKategorie | null }
    | { kind: "unverortet" };
  let section: Section = { kind: "none" };

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    const sourceLine = i + 1;
    if (!trimmed) continue;

    const geprueft = /^Zuletzt geprüft:\s*(.+)$/.exec(trimmed);
    if (geprueft) {
      geprueftAm = geprueft[1].trim();
      continue;
    }

    const topicHeading = /^##\s+\[\[([^\]]+)\]\]\s*$/.exec(trimmed);
    if (topicHeading && isSlug(topicHeading[1])) {
      const slug = topicHeading[1];
      if (!byTopic.has(slug)) byTopic.set(slug, []);
      section = { kind: "topic", slug, kategorie: null };
      continue;
    }

    if (/^##\s+Unverortete Fäden\s*$/.test(trimmed)) {
      section = { kind: "unverortet" };
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      problems.push({
        kind: "vollstaendigkeit",
        message: `Unbekannter Abschnitt „${trimmed.replace(/^##\s+/, "")}" wird ignoriert.`,
        line: sourceLine,
      });
      section = { kind: "none" };
      continue;
    }

    const categoryHeading = /^###\s+(.+)$/.exec(trimmed);
    if (categoryHeading) {
      if (section.kind !== "topic") {
        problems.push({
          kind: "vollstaendigkeit",
          message: `Die Kategorie „${categoryHeading[1]}" steht außerhalb eines Themas.`,
          line: sourceLine,
        });
        continue;
      }
      const kategorie = CATEGORY_HEADINGS[categoryHeading[1].trim()];
      if (!kategorie) {
        problems.push({
          kind: "vollstaendigkeit",
          message: `Unbekannte Kategorie „${categoryHeading[1]}".`,
          line: sourceLine,
        });
      }
      section = { kind: "topic", slug: section.slug, kategorie: kategorie ?? null };
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      const parsed = parseBelegeLine(bullet[1], sourceLine);
      if (!parsed) {
        problems.push({
          kind: "vollstaendigkeit",
          message: "Ein Befund ohne Beleg wird verworfen.",
          line: sourceLine,
        });
        continue;
      }
      if (section.kind === "unverortet") {
        unverorteteFaeden.push(parsed);
        continue;
      }
      if (section.kind === "topic" && section.kategorie) {
        byTopic.get(section.slug)!.push({
          kategorie: section.kategorie,
          text: parsed.text,
          belege: parsed.belege,
        });
        continue;
      }
      problems.push({
        kind: "vollstaendigkeit",
        message: "Ein Befund steht außerhalb einer erkannten Kategorie.",
        line: sourceLine,
      });
      continue;
    }
    // Fließtext zwischen den Zeilen wird stillschweigend übersprungen.
  }

  return { geprueftAm, byTopic, unverorteteFaeden, problems };
}

/**
 * Führt die live berechnete Breite mit dem zuletzt erzeugten Bericht
 * zusammen. `reportRaw` ist null, solange "Lücken analysieren" noch nie
 * lief — dann bleibt Fachkundig für jedes Thema "ungeprueft".
 */
export function buildCompleteness(
  topics: readonly Topic[],
  itemsBySlug: ReadonlyMap<Slug, Item>,
  reportRaw: string | null,
): { completeness: Vollstaendigkeit; problems: ItemProblem[] } {
  const deterministic = computeDeterministicFindings(topics, itemsBySlug);
  const parsed: ParsedCompletenessReport = reportRaw
    ? parseCompletenessReport(reportRaw)
    : { geprueftAm: null, byTopic: new Map(), unverorteteFaeden: [], problems: [] };

  const median_ = medianUmfang(topics);
  const byTopic = new Map<Slug, ThemaVollstaendigkeit>();

  for (const topic of topics) {
    const fachfremdBefunde = deterministic.get(topic.slug) ?? [];
    const umfang = topic.itemSlugs.length + topic.spots.length;
    const fachfremd: PerspektiveErgebnis = {
      stufe: deriveStufeFachfremd(fachfremdBefunde.length, umfang, median_),
      befunde: fachfremdBefunde,
    };

    const themaGesehen = parsed.byTopic.has(topic.slug);
    const fachkundigBefunde = parsed.byTopic.get(topic.slug) ?? [];
    const fachkundig: PerspektiveErgebnis = {
      stufe: deriveStufeFachkundig(
        reportRaw !== null,
        themaGesehen,
        fachkundigBefunde.length,
      ),
      befunde: fachkundigBefunde,
    };

    byTopic.set(topic.slug, { fachfremd, fachkundig });
  }

  return {
    completeness: {
      geprueftAm: parsed.geprueftAm,
      byTopic,
      unverorteteFaeden: parsed.unverorteteFaeden,
    },
    problems: parsed.problems,
  };
}

const FACHKUNDIG_LABEL: Partial<Record<BefundKategorie, string>> = {
  widerspruch: "Widerspruch",
  "unbelegte-zahl": "unbelegte Zahl",
  "nur-normalfall": "Stelle nur Normalfall",
  "offener-verweis": "offener Verweis",
};
const FACHKUNDIG_LABEL_PLURAL: Partial<Record<BefundKategorie, string>> = {
  widerspruch: "Widersprüche",
  "unbelegte-zahl": "unbelegte Zahlen",
  "nur-normalfall": "Stellen nur Normalfall",
  "offener-verweis": "offene Verweise",
};

function pluralDe(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export type VollstaendigkeitSummary = {
  geprueftAm: string | null;
  fachfremdStufe: Stufe;
  fachfremdOk: number;
  fachfremdGesamt: number;
  fachkundigStufe: Stufe;
  /** Fertiger Satz, z. B. "3 unbelegte Zahlen · 1 Widerspruch". */
  fachkundigHinweis: string;
};

/**
 * Eine Zusammenfassung für die ganze Bibliothek — dieselben Zahlen für die
 * Übersichtskarte, egal ob sie in den Einstellungen fest steht oder auf
 * /themen in einer schwebenden Karte auftaucht. Eine Stelle für die
 * Aggregation, damit beide Orte nie auseinanderlaufen.
 */
export function summarizeCompleteness(
  topics: readonly Topic[],
  completeness: Vollstaendigkeit,
): VollstaendigkeitSummary {
  const fachfremdStufen = topics.map(
    (topic) => completeness.byTopic.get(topic.slug)?.fachfremd.stufe ?? "ungeprueft",
  );
  const fachfremdOk = fachfremdStufen.filter(
    (stufe) => stufe === "breit" || stufe === "vertieft",
  ).length;

  const fachkundigStufen = topics.map(
    (topic) => completeness.byTopic.get(topic.slug)?.fachkundig.stufe ?? "ungeprueft",
  );

  const fachkundigCounts = new Map<BefundKategorie, number>();
  for (const topic of topics) {
    for (const befund of completeness.byTopic.get(topic.slug)?.fachkundig.befunde ?? []) {
      fachkundigCounts.set(befund.kategorie, (fachkundigCounts.get(befund.kategorie) ?? 0) + 1);
    }
  }

  const fachkundigHinweis =
    completeness.geprueftAm === null
      ? "Noch nicht geprüft."
      : fachkundigCounts.size === 0
        ? "Keine Befunde."
        : [...fachkundigCounts.entries()]
            .map(([kategorie, anzahl]) =>
              pluralDe(
                anzahl,
                FACHKUNDIG_LABEL[kategorie] ?? kategorie,
                FACHKUNDIG_LABEL_PLURAL[kategorie] ?? kategorie,
              ),
            )
            .join(" · ");

  return {
    geprueftAm: completeness.geprueftAm,
    fachfremdStufe: aggregateStufe(fachfremdStufen),
    fachfremdOk,
    fachfremdGesamt: topics.length,
    fachkundigStufe: aggregateStufe(fachkundigStufen),
    fachkundigHinweis,
  };
}
