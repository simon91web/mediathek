/**
 * Das Datenmodell der Bibliothek. Bewusst ohne "server-only": der Client darf
 * diese Typen importieren, nur nicht die Lesefunktionen aus ./index.
 */

/** Validiert gegen SLUG_PATTERN in ./slug. */
export type Slug = string;

/**
 * Drei Medienarten, ein Modell. Video und Audio verhalten sich in fast allem
 * gleich; Text bricht nur die Zeitachse.
 */
export type MediaKind = "video" | "audio" | "text";

type ChapterBase = {
  /** 0-basiert, nach Sortierung. */
  index: number;
  title: string;
  /** Zeile in der DATEI, 1-basiert (der Kopf zählt mit). Für Meldungen. */
  sourceLine: number;
  /** Aus dem Block "kapitelzusammenfassungen", per Zeitmarke bzw. Titel zugeordnet. */
  summary: string | null;
};

/** Kapitel eines Video- oder Audiobeitrags: eine Zeitmarke wie bei YouTube. */
export type TimeChapter = ChapterBase & {
  kind: "zeit";
  /** Sekunden ab Beginn. */
  start: number;
  /**
   * Start des nächsten Kapitels; null heißt "bis zum Ende". Bewusst nicht
   * Infinity, damit der Wert JSON-tauglich bleibt — und weil die echte Dauer
   * erst der Player kennt.
   */
  end: number | null;
  /** true, wenn start hinter der bekannten Dauer liegt (neu geschnittene Datei). */
  beyondEnd: boolean;
};

/** Kapitel eines Textbeitrags: eine Überschrift mit Ankersprung. */
export type SectionChapter = ChapterBase & {
  kind: "abschnitt";
  /** slugify(title), eindeutig gemacht. Ziel von /medien/<slug>#<anchor>. */
  anchor: string;
  level: 2 | 3;
};

export type Chapter = TimeChapter | SectionChapter;

export type TranscriptSegment = { start: number; end: number; text: string };

export type Transcript = {
  segments: TranscriptSegment[];
  model: string | null;
  language: string | null;
  durationSeconds: number | null;
};

/** Wohin ein Wikilink zeigt. */
export type LinkTarget =
  | { kind: "ganz" }
  | { kind: "zeit"; start: number; end: number | null }
  | { kind: "abschnitt"; anchor: string };

/**
 * Ein Bezug zwischen zwei Beiträgen. Geschrieben wird er nur an einer Stelle;
 * die Gegenrichtung (Rückverweis) berechnet der Index daraus.
 */
export type Reference = {
  from: Slug;
  to: Slug;
  target: LinkTarget;
  /** Eine Zeile Begründung, direkt anzeigbar. */
  note: string;
  /** Zeile in der DATEI, 1-basiert. */
  sourceLine: number;
};

/**
 * Eine Fundstelle: ein Verweis auf eine Stelle irgendwo in der Bibliothek,
 * mit einer Zeile Begründung. Dieselbe Form trägt die Fundstellenliste einer
 * Themenseite und den Eintrag einer Sammlung — der Unterschied liegt allein
 * darin, wer sie ordnet.
 */
export type Spot = {
  slug: Slug;
  target: LinkTarget;
  /** Eine Zeile, direkt anzeigbar. Darf leer sein. */
  note: string;
  /** Zeile in der DATEI, 1-basiert. */
  sourceLine: number;
};

export type AttachmentPreview = "pdf" | "bild" | "keine";

export type Attachment = {
  /** Dateiname innerhalb von anhaenge/. */
  file: string;
  /** Beschriftung aus dem Marker-Block, sonst der humanisierte Dateiname. */
  label: string;
  bytes: number;
  mime: string;
  preview: AttachmentPreview;
  /** true, wenn anhaenge/.text/<datei>.txt vorliegt (für die Suche). */
  hasText: boolean;
};

export type ProblemKind =
  | "frontmatter"
  | "kapitel"
  | "zusammenfassung"
  | "bezug"
  | "anhang"
  | "datei"
  | "transkript";

/**
 * Ein Hinweis, der dem Nutzer auf Deutsch angezeigt wird.
 *
 * `line` zählt in der DATEI, nicht im Text nach dem Kopf — nur so lässt sich
 * die genannte Zeile in einem Editor aufschlagen. Die Teil-Parser rechnen
 * intern im Body; verschoben wird einmal am Ende (siehe ./frontmatter).
 */
export type ItemProblem = {
  kind: ProblemKind;
  message: string;
  line?: number;
};

/** Datei-Kennzahlen für den Cache. size UND mtimeMs, nie nur eines davon. */
export type FileStamp = { size: number; mtimeMs: number };

export type Fingerprint = {
  markdown: FileStamp | null;
  media: FileStamp | null;
  poster: FileStamp | null;
  transcript: FileStamp | null;
  /** Zusammengefasst über alle Dateien in anhaenge/. */
  attachments: FileStamp | null;
};

/**
 * Absolute Pfade, die die Routen benutzen. Einzige Quelle für fs-Zugriffe:
 * eine Route baut NIE selbst einen Pfad aus Nutzereingabe zusammen.
 */
export type ItemAssets = {
  dir: string;
  markdownFile: string;
  /** Video- oder Audiodatei; null bei Textbeiträgen. */
  mediaFile: string | null;
  /** Dateiname wie "video.mp4" — Teil der öffentlichen URL. */
  mediaName: string | null;
  mediaBytes: number | null;
  mediaMime: string | null;
  posterFile: string | null;
  transcriptJsonFile: string | null;
  transcriptVttFile: string | null;
  attachmentsDir: string | null;
};

export type Item = {
  slug: Slug;
  kind: MediaKind;
  /** Frontmatter, sonst humanizeSlug(slug). Nie leer. */
  title: string;
  tags: string[];
  /** "YYYY-MM-DD" als String, nie ein Date (Zeitzonen). */
  recorded: string | null;
  durationSeconds: number | null;
  /**
   * Bei Video/Audio die Beschreibung, bei Text der Inhalt selbst — jeweils
   * ohne die Marker-Blöcke, mit Zeitmarken schon zu [01:24](#t=84) verlinkt.
   */
  description: string;
  chapters: Chapter[];
  summary: string | null;
  references: Reference[];
  attachments: Attachment[];
  hasTranscript: boolean;
  transcriptSegmentCount: number | null;
  assets: ItemAssets;
  /** Leer heißt: alles in Ordnung. */
  problems: ItemProblem[];
  fingerprint: Fingerprint;
  addedAtMs: number;
  changedAtMs: number;
};

/**
 * Ein Thema ist der Einstieg in ein Wissensgebiet: geordnete ganze Beiträge
 * und einzelne Fundstellen quer durch alles. Bewusst kein Kurs — niemand
 * muss etwas durcharbeiten.
 */
export type Topic = {
  slug: Slug;
  title: string;
  description: string;
  /** Reihenfolge = Reihenfolge im Thema. Arten dürfen sich mischen. */
  itemSlugs: Slug[];
  /** Genannt, aber nicht in der Bibliothek vorhanden. */
  missingSlugs: Slug[];
  /**
   * Andere Wörter für dasselbe, wie geschrieben. Sie erweitern die
   * Suchanfrage: wer "Balancing" sucht, findet die Stelle, an der
   * "Zellspannung" gesagt wurde.
   */
  synonyms: string[];
  /** Einzelne Stellen aus dem Block "fundstellen". */
  spots: Spot[];
  tags: string[];
  changedAtMs: number;
  problems: ItemProblem[];
};

/**
 * Eine Sammlung ist ein geordneter Weg durch Ausschnitte — der Themenpfad.
 * Mit `query` wird sie zur gespeicherten Suche, die bei jedem Aufruf neu
 * läuft, statt eine Liste festzuschreiben.
 */
export type Collection = {
  slug: Slug;
  title: string;
  description: string;
  /** Reihenfolge der Datei = Reihenfolge der Wiedergabe. */
  entries: Spot[];
  missingSlugs: Slug[];
  /** Aus "suche:" im Kopf. null heißt: eine feste Liste. */
  query: string | null;
  tags: string[];
  changedAtMs: number;
  problems: ItemProblem[];
};

/**
 * Eine beantwortete Frage. Der Chat legt sie ab, das Zusammenfassen räumt
 * auf — daraus wächst ein FAQ, ohne dass jemand eines pflegen muss.
 */
export type Question = {
  slug: Slug;
  /** Die Frage, wie sie gestellt wurde. */
  question: string;
  /** Dieselbe Frage, anders formuliert — nach dem Zusammenfassen. */
  alsoAsked: string[];
  /** Der Antworttext mit den Wikilinks, wie sie dastehen. */
  answer: string;
  /** Die Belege aus dem Antworttext, in der Reihenfolge des Auftretens. */
  spots: Spot[];
  /** Belegte Beiträge, die es nicht (mehr) gibt. */
  missingSlugs: Slug[];
  /** "YYYY-MM-DD" oder null. */
  askedAt: string | null;
  /** true, wenn beim Beantworten auch das Internet gelesen wurde. */
  usedWeb: boolean;
  tags: string[];
  changedAtMs: number;
  problems: ItemProblem[];
};

/** Eine Fundstelle mit dem Thema, aus dem sie stammt. */
export type TopicSpot = { topic: Topic; spot: Spot };

export type WatchMode = "recursive" | "flach" | "poll" | "aus";

export type LibraryState = {
  /** Steigt bei jedem erfolgreichen Scan. Der Client pollt darauf. */
  generation: number;
  root: string;
  scannedAtMs: number;
  scanDurationMs: number;
  /** Sortiert: aufgenommen absteigend, dann Titel. */
  items: Item[];
  bySlug: Map<Slug, Item>;
  topics: Topic[];
  topicsBySlug: Map<Slug, Topic>;
  /** Welche Themen enthalten diesen Beitrag als ganzen. */
  topicsByItem: Map<Slug, Topic[]>;
  /**
   * Welche Themen haben eine Fundstelle IN diesem Beitrag. Daraus entsteht
   * "Themen in diesem Beitrag" — abgeleitet, nicht zweitgeschrieben.
   */
  topicSpotsByItem: Map<Slug, TopicSpot[]>;
  collections: Collection[];
  collectionsBySlug: Map<Slug, Collection>;
  /** Sortiert: zuletzt gefragt zuerst. */
  questions: Question[];
  questionsBySlug: Map<Slug, Question>;
  /** Rückverweise: berechnet, nicht geschrieben. */
  backlinks: Map<Slug, Reference[]>;
  tags: Array<{ tag: string; count: number }>;
  /** Ordner und Dateien, die gar nicht gelesen werden konnten. */
  problems: Array<{ path: string; message: string }>;
  cache: { readable: boolean; writable: boolean; note: string | null };
  watch: { mode: WatchMode; error: string | null };
};
