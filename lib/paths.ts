import path from "node:path";

/**
 * Alles, was die Mediathek anzeigt, liegt im Bibliotheksordner. Der ist
 * bewusst austauschbar: er darf auf einem Netzlaufwerk liegen und wird als
 * Ganzes weitergegeben. Im Betrieb setzt der Launcher MEDIATHEK_LIBRARY_DIR,
 * in der Entwicklung ist ./bibliothek-dev der Standard.
 *
 * Gemappte Laufwerksbuchstaben sind an die Windows-Sitzung gebunden. Für
 * einen Dienst oder eine andere Kennung besser den UNC-Pfad angeben:
 *   MEDIATHEK_LIBRARY_DIR=\\10.0.4.200\Geteilt\Mediathek
 */
export const LIBRARY_DIR = path.resolve(
  /* turbopackIgnore: true */
  process.env.MEDIATHEK_LIBRARY_DIR ??
    path.join(process.cwd(), "bibliothek-dev"),
);

export const paths = {
  library: LIBRARY_DIR,
  /** Ein Unterordner je Beitrag, Ordnername = Slug. */
  items: path.join(LIBRARY_DIR, "medien"),
  /** Ein Thema je Datei: geordnete Beiträge plus Synonyme für die Suche. */
  topics: path.join(LIBRARY_DIR, "themen"),
  collections: path.join(LIBRARY_DIR, "sammlungen"),
  glossary: path.join(LIBRARY_DIR, "glossar.txt"),
  /** Generierter Index. Nie Wahrheit, jederzeit löschbar. */
  index: path.join(LIBRARY_DIR, "library.json"),
  /**
   * Zwischenlager für Uploads. Muss INNERHALB der Bibliothek liegen, damit
   * fs.rename auf demselben Volume bleibt und damit atomar ist.
   */
  incoming: path.join(LIBRARY_DIR, ".import"),
} as const;

/** Dateinamen innerhalb eines Beitragsordners. */
export const ITEM_FILES = {
  markdown: "beitrag.md",
  transcriptJson: "transcript.json",
  transcriptVtt: "transcript.vtt",
  poster: "poster.jpg",
  attachments: "anhaenge",
  /** Extrahierter Text der Anhänge, nur für die Suche (Etappe 2). */
  attachmentText: ".text",
} as const;

export function itemDir(slug: string): string {
  return path.join(paths.items, slug);
}

export function itemFile(slug: string, name: string): string {
  return path.join(paths.items, slug, name);
}
