import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { paths } from "@/lib/paths";

/*
 * Die Claude-Code-Dateien in die Bibliothek legen.
 *
 * Die Bibliothek ist selbst ein Claude-Code-Projekt: `.claude/CLAUDE.md` und
 * `.claude/commands/*.md` beschreiben, was in den Dateien stehen darf und was
 * unberührt bleibt. Sie gehören IN die Bibliothek und nicht in die
 * Anwendung, denn sie wandern mit dem Ordner: liegt er auf dem
 * Netzlaufwerk, kann ein Kollege dort dieselbe Sitzung starten.
 *
 * Vorhandene Dateien werden NIE überschrieben. Wer eine Regel für seine
 * Bibliothek angepasst hat, verliert sie nicht durch einen Klick — und die
 * Regeln sind genau der Teil, den man anpasst.
 */

/** Vorlagenordner im Programm. Fehlt er, ist das kein Fehler, nur nichts zu tun. */
function templateDir(): string {
  return path.join(process.cwd(), "vorlagen", "bibliothek-claude");
}

export type InstallResult = {
  ok: boolean;
  /** Angelegte Dateien, relativ zur Bibliothek. */
  created: string[];
  /** Vorhandene, absichtlich unangetastete Dateien. */
  kept: string[];
  error: string | null;
};

/** Alle Dateien unter `dir`, relativ zu `dir`. */
async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(dir, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

export async function installClaudeFiles(): Promise<InstallResult> {
  const source = templateDir();

  let files: string[];
  try {
    files = await listFiles(source);
  } catch {
    return {
      ok: false,
      created: [],
      kept: [],
      error:
        `Die Vorlagen fehlen (${source}). Sie gehören zum Programm — ` +
        "vermutlich ist das Paket unvollständig.",
    };
  }

  const created: string[] = [];
  const kept: string[] = [];

  for (const file of files) {
    const target = path.join(paths.claude, ...file.split("/"));
    try {
      await fs.access(target);
      kept.push(`.claude/${file}`);
      continue;
    } catch {
      // Nicht da: anlegen.
    }
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(source, ...file.split("/")), target);
      created.push(`.claude/${file}`);
    } catch (error) {
      return {
        ok: false,
        created,
        kept,
        error: `${file} ließ sich nicht anlegen: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  return { ok: true, created, kept, error: null };
}

/** Liegt der Vertrag schon in der Bibliothek? Für die Anzeige. */
export async function claudeFilesInstalled(): Promise<boolean> {
  try {
    await fs.access(path.join(paths.claude, "CLAUDE.md"));
    return true;
  } catch {
    return false;
  }
}
