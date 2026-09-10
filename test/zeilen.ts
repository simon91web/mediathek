/**
 * Findet die DATEIZEILE (1-basiert), in der `needle` zuerst vorkommt.
 *
 * Damit steht in den Tests keine ausgezählte Zahl, die beim nächsten
 * eingefügten Satz still falsch wird — die erwartete Zeile wird aus derselben
 * Vorlage gelesen, die auch der Parser bekommt.
 */
export function fileLineOf(source: string, needle: string): number {
  const lines = source.split(/\r\n?|\n/);
  const index = lines.findIndex((line) => line.includes(needle));
  if (index === -1) {
    throw new Error(`"${needle}" steht nicht in der Vorlage.`);
  }
  return index + 1;
}
