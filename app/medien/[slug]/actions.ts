"use server";

import { revalidatePath } from "next/cache";

import { launchClaude } from "@/lib/claude/launch";
import type { ClaudeCommand } from "@/lib/claude/launch";
import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { cancelJob, startJob } from "@/lib/jobs";
import type { Job, JobKind } from "@/lib/jobs";

/*
 * Aufträge anstellen und abbrechen.
 *
 * Als Server Action, nicht als Route Handler: Next prüft dabei den Origin
 * gegen den Host. Ohne diesen Schutz könnte jede Webseite, die im selben
 * Browser offen ist, per fetch auf 127.0.0.1 einen Lauf auslösen — und
 * spätestens beim Knopf, der Claude Code startet, ist das die
 * gefährlichste Lücke.
 */

export type JobActionResult =
  { ok: true; job: Job } | { ok: false; error: string };

export async function startJobAction(
  kind: JobKind,
  slug: string,
): Promise<JobActionResult> {
  try {
    await assertAuthorMode();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Das ist hier nicht möglich.",
    };
  }

  const result = await startJob(kind, slug);
  if (!result.ok) return result;

  revalidatePath(`/medien/${slug}`);
  return { ok: true, job: result.job };
}

export async function cancelJobAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAuthorMode();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Das ist hier nicht möglich.",
    };
  }

  const stopped = await cancelJob(id);
  return stopped
    ? { ok: true }
    : { ok: false, error: "Dieser Auftrag läuft nicht mehr." };
}

/**
 * Öffnet ein Fenster mit Claude Code für DIESEN Beitrag — /kapitel oder
 * /bezuege.
 *
 * Die Prüfung des Slugs liegt in lib/claude/launch.ts: gegen die Grammatik,
 * gegen den Index UND gegen das Dateisystem. Hier steht nur der Riegel, der
 * für jede schreibende Handlung gilt.
 */
export async function startClaudeAction(
  command: ClaudeCommand,
  slug: string,
): Promise<{ ok: true; prompt: string } | { ok: false; error: string }> {
  try {
    await assertAuthorMode();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof NotAllowedError
          ? error.message
          : "Das ist hier nicht möglich.",
    };
  }

  return launchClaude(command, slug);
}
