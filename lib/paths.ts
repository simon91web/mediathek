import path from "node:path";

/**
 * Alles, was die Mediathek anzeigt, liegt im Bibliotheksordner. Der ist
 * bewusst austauschbar: er darf auf einem Netzlaufwerk liegen und wird als
 * Ganzes weitergegeben.
 *
 * Woher der Pfad kommt, in dieser Reihenfolge:
 *
 *   1. MEDIATHEK_LIBRARY_DIR — setzt der Launcher des Viewer-Pakets. Ist sie
 *      gesetzt, gewinnt sie und der Ordner ist NICHT umstellbar. Genau das
 *      soll sie leisten: der Kollege bekommt den Ordner vorgegeben.
 *   2. Der unter Einstellungen gewählte Ordner (maschinenlokal in
 *      settings.json). Angewandt beim Serverstart, siehe
 *      ./library/library-dir.
 *   3. ./bibliothek-dev — der Standard in der Entwicklung.
 *
 * Gemappte Laufwerksbuchstaben sind an die Windows-Sitzung gebunden. Für
 * einen Dienst oder eine andere Kennung besser den UNC-Pfad angeben:
 *   \\10.0.4.200\Geteilt\Mediathek
 *
 * WICHTIG: Diese Datei liegt über lib/library/urls.ts auch im Client-Bundle.
 * Sie darf deshalb NICHTS aus node:fs anfassen und keine Nebenwirkung auf
 * Modulebene haben. Der Ordner wird hier nur gehalten, gelesen wird die
 * Einstellung anderswo.
 */

/** Gesetzt heißt: der Ordner steht fest und lässt sich nicht umstellen. */
export const LIBRARY_DIR_FIXED = Boolean(
  process.env.MEDIATHEK_LIBRARY_DIR?.trim(),
);

/**
 * Der Ordner ohne jede Einstellung: Umgebungsvariable, sonst ./bibliothek-dev.
 *
 * Eine LEERE Variable gilt als nicht gesetzt — und das ist kein Detail:
 * `MEDIATHEK_LIBRARY_DIR=` ergab mit `??` den leeren String, `path.resolve("")`
 * ist das Arbeitsverzeichnis, und damit wurde der Programmordner selbst zur
 * Bibliothek. Genau so kommt die Variable aus einer cmd-Datei, wenn die
 * bibliothek.txt leer ist. `LIBRARY_DIR_FIXED` oben prüft schon mit `trim()`;
 * ohne dieselbe Prüfung hier wären die beiden uneins.
 */
export function defaultLibraryRoot(): string {
  const fest = process.env.MEDIATHEK_LIBRARY_DIR?.trim();
  return path.resolve(
    /* turbopackIgnore: true */
    fest || path.join(process.cwd(), "bibliothek-dev"),
  );
}

/*
 * Auf globalThis, und zwar IMMER — nicht nur im Entwicklungsbetrieb.
 * instrumentation.ts lädt seine Module per await import(); unter Turbopack
 * kann das eine andere Modulinstanz sein als die der Route Handler. Ein
 * Modul-let würde dort gesetzt und hier nicht gesehen, und die Seite zeigte
 * weiter den alten Ordner.
 */
const globalForPaths = globalThis as unknown as {
  mediathekLibraryDir?: string;
};

export function libraryRoot(): string {
  return (globalForPaths.mediathekLibraryDir ??= defaultLibraryRoot());
}

/**
 * Setzt den Ordner für diesen Prozess.
 *
 * Nicht von Hand aufrufen: der Umstieg ist mehr als ein Pfad — Index,
 * Beobachter, Suchindex und Transkript-Zwischenspeicher gehören dazu. Dafür
 * ist `switchLibrary` in ./library/switch da.
 */
export function setLibraryRoot(dir: string): void {
  globalForPaths.mediathekLibraryDir = path.resolve(dir);
}

/*
 * Getter, keine Konstanten: der Ordner kann sich zur Laufzeit ändern. Für
 * die fünfzehn Dateien, die `paths.items` benutzen, bleibt es dieselbe
 * Schreibweise — sie sehen den Wechsel einfach.
 */
export const paths = {
  get library(): string {
    return libraryRoot();
  },
  /** Ein Unterordner je Beitrag, Ordnername = Slug. */
  get items(): string {
    return path.join(libraryRoot(), "medien");
  },
  /** Ein Thema je Datei: geordnete Beiträge plus Synonyme für die Suche. */
  get topics(): string {
    return path.join(libraryRoot(), "themen");
  },
  get collections(): string {
    return path.join(libraryRoot(), "sammlungen");
  },
  /**
   * Eine Frage je Datei, mit ihrer Antwort. Wächst von selbst: der Chat legt
   * hier ab, was er beantwortet hat.
   */
  get questions(): string {
    return path.join(libraryRoot(), "fragen");
  },
  get glossary(): string {
    return path.join(libraryRoot(), "glossar.txt");
  },
  /** Generierte Berichte, allen voran die Lücken-Analyse. Kein Marker-Block. */
  get analysen(): string {
    return path.join(libraryRoot(), "analysen");
  },
  /**
   * Die Bibliothek ist selbst ein Claude-Code-Projekt: hier liegen CLAUDE.md
   * und die Slash-Befehle, nach denen geschrieben werden darf. Sie wandern
   * mit dem Ordner mit — beim Kollegen liegt derselbe Vertrag.
   */
  get claude(): string {
    return path.join(libraryRoot(), ".claude");
  },
  /** Generierter Index. Nie Wahrheit, jederzeit löschbar. */
  get index(): string {
    return path.join(libraryRoot(), "library.json");
  },
  /**
   * Zwischenlager für Uploads. Muss INNERHALB der Bibliothek liegen, damit
   * fs.rename auf demselben Volume bleibt und damit atomar ist.
   */
  get incoming(): string {
    return path.join(libraryRoot(), ".import");
  },
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
