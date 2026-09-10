"use server";

import { revalidatePath } from "next/cache";

import { getFeatures, invalidateFeatures } from "@/lib/features";
import { reloadLibrary } from "@/lib/library";
import { invalidateTranscripts } from "@/lib/library/transcript";
import { isReadonly, writeSettings } from "@/lib/settings";

/*
 * Schreibende Vorgänge laufen als Server Action, nicht als Route Handler.
 *
 * Das ist keine Stilfrage: Next prüft bei Server Actions den Origin gegen den
 * Host. Ohne diesen Schutz könnte jede Webseite, die im selben Browser offen
 * ist, per fetch auf 127.0.0.1 schießen — und spätestens beim Knopf, der
 * Claude Code startet (Etappe 3), ist das die gefährlichste Lücke.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Liest die Bibliothek neu ein, den Cache ausdrücklich ignorierend.
 *
 * Das ist der Ausweg für den Fall, dass Größe UND Zeitstempel einer Datei
 * gleich geblieben sind, der Inhalt aber nicht — etwa nach einem Kopiervorgang
 * über SMB, der die Zeit der Quelle übernimmt.
 */
export async function reloadLibraryAction(): Promise<ActionResult> {
  try {
    invalidateTranscripts();
    const result = await reloadLibrary({ force: true });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        `${result.items} ${result.items === 1 ? "Beitrag" : "Beiträge"} ` +
        `neu gelesen (${result.durationMs} ms).`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Schaltet den Autorenmodus um. Im Viewer-Paket ist das hart versperrt. */
export async function setAuthorModeAction(
  enabled: boolean,
): Promise<ActionResult> {
  if (isReadonly()) {
    return {
      ok: false,
      error:
        "Diese Mediathek ist zum Ansehen eingerichtet — der Autorenmodus " +
        "lässt sich hier nicht einschalten.",
    };
  }

  const written = await writeSettings({ authorMode: enabled });
  if (!written.ok) {
    return {
      ok: false,
      error: `Die Einstellung konnte nicht gespeichert werden: ${written.error}`,
    };
  }

  invalidateFeatures();
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: enabled
      ? "Autorenmodus ist an. Beiträge lassen sich jetzt bearbeiten."
      : "Autorenmodus ist aus.",
  };
}

/** Sucht ffmpeg neu — nach einer Installation oder einem Pfadwechsel. */
export async function reprobeToolsAction(): Promise<ActionResult> {
  invalidateFeatures();
  const features = await getFeatures(true);
  revalidatePath("/einstellungen");
  return {
    ok: true,
    message:
      features.ffmpeg === "ok"
        ? `ffmpeg gefunden${features.ffmpegDir ? ` in ${features.ffmpegDir}` : " über den Suchpfad"}.`
        : "ffmpeg wurde nicht gefunden.",
  };
}

/** Merkt sich das Verzeichnis mit ffmpeg.exe und ffprobe.exe. */
export async function setFfmpegDirAction(
  dir: string,
): Promise<ActionResult> {
  const trimmed = dir.trim();
  const written = await writeSettings({ ffmpegDir: trimmed || null });
  if (!written.ok) {
    return {
      ok: false,
      error: `Die Einstellung konnte nicht gespeichert werden: ${written.error}`,
    };
  }

  invalidateFeatures();
  const features = await getFeatures(true);
  revalidatePath("/einstellungen");

  if (trimmed && features.ffmpeg !== "ok") {
    return {
      ok: false,
      error:
        `In "${trimmed}" ließ sich ffprobe.exe nicht aufrufen. Erwartet wird ` +
        "das Verzeichnis, in dem ffmpeg.exe und ffprobe.exe liegen — " +
        "typisch C:\\ffmpeg-master-latest-win64-gpl-shared\\bin",
    };
  }

  return {
    ok: true,
    message: trimmed
      ? `ffmpeg wird aus ${trimmed} verwendet.`
      : "Der eingetragene Pfad wurde entfernt; es gilt wieder der Suchpfad.",
  };
}
