"use server";

import { revalidatePath } from "next/cache";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { clearFinishedJobs } from "@/lib/jobs";
import { catchUpJobs } from "@/lib/jobs/auto";
import { startChainForAll } from "@/lib/jobs/chain";

export type CatchUpActionResult =
  { ok: true; message: string } | { ok: false; error: string };

/**
 * Stellt für die ganze Bibliothek an, was fehlt.
 *
 * Gedacht für den häufigsten Fall: es liegen Beiträge da, die nie durch die
 * Automatik gelaufen sind — weil sie vor ihr importiert wurden oder weil
 * etwas schiefging.
 */
export async function catchUpJobsAction(): Promise<CatchUpActionResult> {
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

  const result = await catchUpJobs();
  revalidatePath("/auftraege");

  if (result.jobs === 0) {
    const nichts =
      result.skipped.length > 0
        ? `Nichts anzustellen. Übersprungen: ${result.skipped.join(", ")}.`
        : "Nichts anzustellen — alle Beiträge sind vollständig.";
    return { ok: true, message: nichts };
  }

  return {
    ok: true,
    message:
      `${result.jobs} ${result.jobs === 1 ? "Auftrag" : "Aufträge"} für ` +
      `${result.items} ${result.items === 1 ? "Beitrag" : "Beiträge"} ` +
      "angestellt." +
      (result.skipped.length > 0
        ? ` Übersprungen: ${result.skipped.join(", ")}.`
        : ""),
  };
}

/**
 * Die ganze Kette für alles, was noch etwas braucht.
 *
 * Der Unterschied zu `catchUpJobsAction`: dort laufen nur die
 * Maschinenschritte (Kachelbild, Transkript, Anhangtext), hier zusätzlich
 * Kapitel, Suche und Bezüge. Das ist der Knopf, der aus einem Ordner voller
 * Rohaufnahmen eine erschlossene Mediathek macht — und er kann Stunden
 * laufen, deshalb steht er nicht allein da.
 */
export async function chainAllAction(): Promise<CatchUpActionResult> {
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

  const result = await startChainForAll();
  revalidatePath("/auftraege");

  if (result.queued === 0) {
    return {
      ok: true,
      message:
        result.skipped.length > 0
          ? `Nichts anzustellen. Übersprungen: ${result.skipped.join(" ")}`
          : "Nichts anzustellen — alle Beiträge sind erschlossen.",
    };
  }

  return {
    ok: true,
    message:
      `${result.queued} ${result.queued === 1 ? "Schritt" : "Schritte"} für ` +
      `${result.items} ${result.items === 1 ? "Beitrag" : "Beiträge"} ` +
      "angestellt." +
      (result.skipped.length > 0
        ? ` Übersprungen: ${result.skipped.join(" ")}`
        : ""),
  };
}

/** Wirft die erledigten Aufträge aus dem Verlauf. */
export async function clearFinishedJobsAction(): Promise<CatchUpActionResult> {
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

  const weg = await clearFinishedJobs();
  revalidatePath("/auftraege");
  return {
    ok: true,
    message:
      weg === 0
        ? "Im Verlauf steht nichts Erledigtes."
        : `${weg} erledigte ${weg === 1 ? "Auftrag" : "Aufträge"} entfernt.`,
  };
}
