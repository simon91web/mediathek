import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

/*
 * Die Python-Umgebung für die Transkription.
 *
 * Harte Regel: kein Modul im Render-Pfad darf hier hereinschauen. Wer nur
 * zusieht, braucht kein Python — Transkription ist reine Autorensache, und
 * ein Zuschauer ohne Python muss die Mediathek vollständig benutzen können.
 */

export type PythonEnv = {
  exe: string;
  /** Verzeichnis mit cublas64_12.dll, falls im venv installiert. */
  cublasDir: string | null;
  toolsDir: string;
  script: string;
};

export type PythonState = "ok" | "fehlt";

function venvPython(toolsDir: string): string {
  return process.platform === "win32"
    ? path.join(toolsDir, ".venv", "Scripts", "python.exe")
    : path.join(toolsDir, ".venv", "bin", "python");
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function findPythonEnv(): Promise<PythonEnv | null> {
  const toolsDir = path.join(process.cwd(), "tools");
  const exe = venvPython(toolsDir);
  if (!(await exists(exe))) return null;

  const script = path.join(toolsDir, "transcribe.py");
  if (!(await exists(script))) return null;

  const cublas = path.join(
    toolsDir,
    ".venv",
    "Lib",
    "site-packages",
    "nvidia",
    "cublas",
    "bin",
  );
  const cublasDir = (await exists(path.join(cublas, "cublas64_12.dll")))
    ? cublas
    : null;

  return { exe, cublasDir, toolsDir, script };
}

/**
 * Das Umgebungsprofil für den Kindprozess.
 *
 * Zwei Dinge sind hier unverzichtbar:
 *
 * 1. `PYTHONUTF8=1` — Python 3.14 nutzt beim Pipe cp1252. Ohne das stirbt
 *    der Lauf am ersten Umlaut in einer Ausgabe, und zwar mitten in einem
 *    90-Minuten-Video.
 * 2. cuBLAS VOR den Suchpfad. `os.add_dll_directory()` wirkt für
 *    ctranslate2 nachweislich nicht — es lädt die Bibliothek per einfachem
 *    LoadLibrary, und AddDllDirectory greift nur bei LoadLibraryEx mit
 *    LOAD_LIBRARY_SEARCH_*-Flags. Das Voranstellen an PATH funktioniert.
 */
export function childEnv(
  env: PythonEnv,
  ffmpegDir: string | null,
): NodeJS.ProcessEnv {
  const parts = [env.cublasDir, ffmpegDir, process.env.PATH].filter(
    (entry): entry is string => Boolean(entry),
  );

  return {
    ...process.env,
    PYTHONUTF8: "1",
    PYTHONUNBUFFERED: "1",
    // Die Warnung über fehlende Symlinks im Modell-Cache ist auf Windows
    // erwartbar und nur Lärm im Protokoll.
    HF_HUB_DISABLE_SYMLINKS_WARNING: "1",
    PATH: parts.join(path.delimiter),
  };
}
