import type { Slug } from "./types";

/**
 * Ein Slug ist Ordnername, ID und URL-Bestandteil in einem. Das Muster ist
 * absichtlich eng: es verbietet strukturell alles, was auf Windows oder in
 * einer URL Ärger macht.
 *
 * Ausgeschlossen sind damit automatisch:
 *   ".." und "."      Pfadwechsel
 *   "/" "\"           Pfadtrenner
 *   ":"               NTFS-Alternate-Data-Streams (video.mp4:$DATA)
 *   "~"               8.3-Kurznamen (PROGRA~1)
 *   Leerzeichen, Anführungszeichen, ";" "&" "|" "`" "$" "(" ")" "%"
 *   führende/abschließende Bindestriche und Punkte (Windows schneidet
 *   abschließende Punkte ab, "slug." und "slug" wären dieselbe Datei)
 */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Namen, die als Kennung nicht taugen.
 *
 * Zum einen die eigenen Routen: /medien/<slug> darf sich nicht mit einer
 * statischen Unterseite überschneiden, sonst wäre der Beitrag unerreichbar.
 *
 * Zum anderen die reservierten Windows-Gerätenamen — ein Ordner "con" lässt
 * sich auf NTFS nicht anlegen, und ein Zugriff darauf blockiert im
 * schlimmsten Fall den Prozess.
 */
const RESERVED_NAMES = new Set([
  "neu",
  "import",
  "importieren",
  "anlegen",
  "aufnehmen",
  "bearbeiten",
  "suche",
  "api",
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

export function isSlug(value: unknown): value is Slug {
  return (
    typeof value === "string" &&
    SLUG_PATTERN.test(value) &&
    !RESERVED_NAMES.has(value)
  );
}

/**
 * Wirft bei ungültigem Slug. Für Routen und Server Actions, damit eine
 * Nutzereingabe niemals ungeprüft in einen Pfad gerät.
 */
export function assertSlug(value: unknown): Slug {
  if (!isSlug(value)) {
    throw new Error(`Ungültiger Slug: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Deutsche Sonderfälle werden ERSETZT, nicht entfernt — und das muss vor der
 * NFD-Zerlegung passieren. Andernfalls wird aus "ü" ein "u", und
 * "Überflug" hieße "uberflug" statt "ueberflug".
 */
const GERMAN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

const MAX_SLUG_LENGTH = 60;

/**
 * Wandelt einen beliebigen Titel oder Dateinamen in einen Slug.
 * Länge 60 statt der erlaubten 64, damit für Kollisionssuffixe wie "-12"
 * noch Platz bleibt — und wegen der 260-Zeichen-Pfadgrenze auf Windows.
 */
export function slugify(input: string): Slug {
  let value = input.normalize("NFC").toLowerCase();
  for (const [pattern, replacement] of GERMAN_REPLACEMENTS) {
    value = value.replace(pattern, replacement);
  }
  value = value
    // Restliche Diakritika entfernen (é → e, ñ → n).
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (value.length > MAX_SLUG_LENGTH) {
    const cut = value.slice(0, MAX_SLUG_LENGTH);
    // Bevorzugt an einer Wortgrenze schneiden, sonst hart.
    const atBoundary = cut.replace(/-+[^-]*$/, "");
    value = (atBoundary || cut).replace(/^-+|-+$/g, "");
  }

  if (!value || RESERVED_NAMES.has(value)) return value ? `${value}-1` : "beitrag";
  return value;
}

/**
 * Macht einen Slug eindeutig. `taken` muss BEIDES prüfen: den Index und das
 * Dateisystem, und zwar case-insensitiv — auf NTFS sind "Elios" und "elios"
 * derselbe Ordner, und ein Ordner kann existieren, ohne im Index zu stehen
 * (kaputte Datei, laufender Scan).
 */
export function uniqueSlug(
  base: string,
  taken: (candidate: Slug) => boolean,
): Slug {
  const root = slugify(base);
  if (!taken(root)) return root;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${root.slice(0, MAX_SLUG_LENGTH - 4)}-${n}`.replace(
      /^-+|-+$/g,
      "",
    );
    if (!taken(candidate)) return candidate;
  }
  return `${root.slice(0, 45)}-${Date.now().toString(36)}`;
}

/**
 * Lesbarer Titel aus einem Slug — der Rückfall, wenn beitrag.md fehlt oder
 * kaputt ist. Ein Beitrag ohne Titel ist immer noch besser als "Ohne Titel".
 */
export function humanizeSlug(slug: Slug): string {
  const words = slug.split("-").filter(Boolean);
  if (words.length === 0) return "Ohne Titel";
  return words
    .map((word) => {
      // Reine Zahlen bleiben, wie sie sind.
      if (/^\d+$/.test(word)) return word;
      /*
       * Jedes Wort groß. Im Deutschen ließe sich nicht raten, welches Wort
       * ein Substantiv ist — und "Vorflugkontrolle Elios 3" liest sich
       * deutlich besser als "Vorflugkontrolle elios 3".
       */
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}
