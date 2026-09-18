/**
 * POSIX-Shell-Quoting: der Wert wird zu einem einzigen Wort, egal welche
 * Zeichen darin stehen.
 *
 * Einfache Anführungszeichen, und ein Apostroph darin wird zu `'\''`
 * zerlegt — das ist die eine Form, die in jeder POSIX-Shell dasselbe tut.
 * Genau deshalb darf ein Auftragstext so in eine temporäre Datei, ohne dass
 * irgendetwas daraus ein zweites Argument oder ein Befehl wird.
 */
export function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
