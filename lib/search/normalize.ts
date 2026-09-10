/*
 * Deutsche Texte vergleichbar machen.
 *
 * Ohne "server-only": die Reinigung muss auf Server und Client identisch
 * sein, sonst findet die Anfrage nicht, was der Index enthält.
 */

/**
 * Faltet einen Begriff auf eine Vergleichsform.
 *
 * Umlaute werden ausgeschrieben (ä → ae), damit „Aufblähung" auch als
 * „aufblaehung" gefunden wird — und umgekehrt. Das MUSS für Index und
 * Anfrage dieselbe Funktion sein.
 */
export function foldTerm(input: string): string {
  return input
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .normalize("NFC");
}

/**
 * Zerlegt Text in Suchbegriffe.
 *
 * Der Bindestrich trennt: so findet „Elios" auch „Elios-3". Ziffern bleiben,
 * weil sie in Fachtexten Bedeutung tragen („3,7 Volt", „Elios 3").
 */
export function tokenize(input: string): string[] {
  return input
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** Die Anfrage in gefaltete Begriffe. Anführungszeichen bleiben erhalten. */
export function parseQuery(raw: string): {
  terms: string[];
  /** Wortgruppen in Anführungszeichen — die müssen wörtlich vorkommen. */
  phrases: string[];
} {
  const phrases: string[] = [];
  const withoutPhrases = raw.replace(/"([^"]+)"/g, (_match, phrase: string) => {
    const trimmed = phrase.trim();
    if (trimmed) phrases.push(trimmed);
    return " ";
  });

  return {
    terms: tokenize(withoutPhrases).map(foldTerm).filter(Boolean),
    phrases,
  };
}
