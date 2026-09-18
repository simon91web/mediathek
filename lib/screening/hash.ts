import crypto from "node:crypto";

/**
 * Ein kurzer, stabiler Schlüssel für einen Quellpfad — dient als Job-Kennwort
 * (eindeutig je Datei, siehe `startScreeningJob`) und als Name des
 * Scratch-Ordners (`lib/screening/runner.ts::screeningDir`).
 */
export function hashSourcePath(sourcePath: string): string {
  return crypto
    .createHash("sha1")
    .update(sourcePath)
    .digest("hex")
    .slice(0, 16);
}
