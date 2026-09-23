/** Dateien, die noch nicht im Vault liegen. Vorhandene werden nie ersetzt. */
export function filesToCopy(
  bundled: readonly string[],
  existing: ReadonlySet<string>,
): string[] {
  return bundled.filter((file) => !existing.has(file.replaceAll("\\", "/")));
}
