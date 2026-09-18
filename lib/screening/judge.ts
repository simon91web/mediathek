import "server-only";

import { spawn } from "node:child_process";

import { getFeatures } from "@/lib/features";
import { paths } from "@/lib/paths";
import { readSettings } from "@/lib/settings";
import type { ScreeningVerdict } from "./types";

/*
 * Ein einziger Aufruf des KI-Assistenten: "ist das schon abgedeckt?" — kein
 * Chat, keine Historie, keine Datei wird geschrieben.
 *
 * Nach dem Bauplan von lib/assistant/chat.ts (derselbe Aufruf: stdin, kein
 * shell, Arbeitsverzeichnis die Bibliothek), aber EINGESAMMELT statt
 * gestreamt — die Antwort muss geparst werden, und ein Parser auf einem
 * Strom, der im Fehlerfall auch freie deutsche Prosa enthalten kann
 * (chat.ts:195-197, 225-230), wäre zerbrechlich.
 */

const MAX_TRANSCRIPT_CHARS = 6_000;
const MAX_OUTPUT_CHARS = 4_000;
const TIMEOUT_MS = 180_000;

export type JudgeCandidate = { slug: string; title: string; snippet: string };

export type JudgeResult =
  | { ok: true; verdict: ScreeningVerdict; text: string }
  | { ok: false; error: string };

function systemPrompt(): string {
  return [
    "Du beurteilst für eine lokale Mediathek eine Aufnahme, die noch NICHT " +
      "importiert ist. Dein Arbeitsverzeichnis ist die Bibliothek selbst — " +
      "lies dort, was für die Einschätzung hilft (themen/*.md, " +
      "medien/*/beitrag.md, deren transcript.json), aber SCHREIBE NICHTS " +
      "und ändere keine Datei.",
    "",
    "Antworte in genau diesem Aufbau:",
    "Erste Zeile ausschließlich eine von: " +
      '"EINSCHÄTZUNG: neu", "EINSCHÄTZUNG: aehnlich", "EINSCHÄTZUNG: vorhanden".',
    "  neu — kein bestehender Beitrag deckt das ab.",
    "  aehnlich — es gibt Überlappung, aber auch etwas Neues oder einen anderen Blickwinkel.",
    "  vorhanden — ein bestehender Beitrag deckt das im Wesentlichen schon ab.",
    "Danach 2 bis 4 Sätze Fließtext auf Deutsch: was die Aufnahme zeigt, und " +
      "warum diese Einschätzung.",
    "",
    "BELEGE ALS VERWEIS, nicht als Titel in Anführungszeichen: sobald du dich " +
      "auf einen bestehenden Beitrag aus der Kandidatenliste beziehst, " +
      "schreibe genau seine Kennung als [[kennung]] mitten in den Satz — " +
      "niemals seinen Titel als Text. Beispiel: „Das deckt sich mit dem, was " +
      "[[akku-grundlagen]] schon zeigt.“ statt „...mit dem Beitrag " +
      '„Akku-Grundlagen"...“. Nur Kennungen aus der Kandidatenliste, keine ' +
      "erfundenen.",
  ].join("\n");
}

function buildPrompt(
  transcriptExcerpt: string,
  candidates: readonly JudgeCandidate[],
): string {
  const kandidaten = candidates.length
    ? candidates
        .map((c) => `- [[${c.slug}]] „${c.title}" — ${c.snippet}`)
        .join("\n")
    : "(die Suche hat nichts Passendes gefunden)";

  return [
    "Kurztranskript der neuen Aufnahme:",
    '"""',
    transcriptExcerpt.slice(0, MAX_TRANSCRIPT_CHARS),
    '"""',
    "",
    "Mögliche Kandidaten aus der Suche (nicht garantiert relevant):",
    kandidaten,
  ].join("\n");
}

const VERDICT_LINE = /^EINSCH[ÄA]TZUNG:\s*(neu|aehnlich|vorhanden)\b/i;

export function parseResponse(
  raw: string,
): { verdict: ScreeningVerdict; text: string } {
  const trimmed = raw.trim();
  const newline = trimmed.indexOf("\n");
  const firstLine = newline === -1 ? trimmed : trimmed.slice(0, newline);
  const rest = newline === -1 ? "" : trimmed.slice(newline + 1).trim();

  const match = VERDICT_LINE.exec(firstLine);
  const verdict = (match?.[1].toLowerCase() as ScreeningVerdict | undefined) ?? "unklar";
  return { verdict, text: rest || trimmed };
}

export async function judgeScreening(
  transcriptExcerpt: string,
  candidates: readonly JudgeCandidate[],
): Promise<JudgeResult> {
  const features = await getFeatures();
  if (features.assistant !== "ok") {
    return {
      ok: false,
      error:
        `Das Werkzeug „${features.assistantCommand}" wurde nicht gefunden — ` +
        "einzurichten unter Einstellungen → KI-Assistent.",
    };
  }

  const settings = await readSettings();
  const prompt = `${systemPrompt()}\n\n${buildPrompt(transcriptExcerpt, candidates)}`;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: JudgeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let child;
    try {
      child = spawn(settings.assistantCommand, [...settings.chatArgs], {
        cwd: paths.library,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      finish({
        ok: false,
        error: `Konnte „${settings.assistantCommand}" nicht starten: ${String(error)}`,
      });
      return;
    }

    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: "Der Assistent hat nicht rechtzeitig geantwortet." });
    }, TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_CHARS) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 2_000) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      finish({ ok: false, error: `Der Assistent lief nicht an: ${error.message}` });
    });
    child.on("close", () => {
      const text = stdout.trim();
      if (!text) {
        finish({
          ok: false,
          error: stderr.trim()
            ? `Keine Antwort. ${stderr.trim().slice(0, 300)}`
            : "Keine Antwort vom Assistenten.",
        });
        return;
      }
      const { verdict, text: body } = parseResponse(text);
      finish({ ok: true, verdict, text: body });
    });

    child.stdin?.end(prompt, "utf8");
  });
}
