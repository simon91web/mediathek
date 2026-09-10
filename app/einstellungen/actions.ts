"use server";

import { revalidatePath } from "next/cache";

import { installClaudeFiles } from "@/lib/claude/install";
import { launchClaude } from "@/lib/claude/launch";
import type { ClaudeCommand } from "@/lib/claude/launch";
import {
  assertAuthorMode,
  getFeatures,
  invalidateFeatures,
  NotAllowedError,
} from "@/lib/features";
import { reloadLibrary } from "@/lib/library";
import { switchLibrary } from "@/lib/library/switch";
import { invalidateTranscripts } from "@/lib/library/transcript";
import { invalidateSearchIndex } from "@/lib/search";
import { isReadonly, WHISPER_MODELS, writeSettings } from "@/lib/settings";
import type { WhisperModel } from "@/lib/settings";

/*
 * Schreibende Vorgänge laufen als Server Action, nicht als Route Handler.
 *
 * Das ist keine Stilfrage: Next prüft bei Server Actions den Origin gegen den
 * Host. Ohne diesen Schutz könnte jede Webseite, die im selben Browser offen
 * ist, per fetch auf 127.0.0.1 schießen — und spätestens beim Knopf, der
 * Claude Code startet (Etappe 3), ist das die gefährlichste Lücke.
 */

export type ActionResult =
  { ok: true; message: string } | { ok: false; error: string };

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
    invalidateSearchIndex();
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
export async function setFfmpegDirAction(dir: string): Promise<ActionResult> {
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

/**
 * Whisper-Modell und Sprache.
 *
 * Die Wahl gilt nur auf dieser Maschine — auf einem Rechner ohne
 * NVIDIA-Karte wäre large-v3-turbo etwa Echtzeit und damit unbrauchbar,
 * dort ist "small" richtig.
 */
export async function setWhisperAction(input: {
  model: string;
  language: string;
}): Promise<ActionResult> {
  const model = WHISPER_MODELS.includes(input.model as WhisperModel)
    ? (input.model as WhisperModel)
    : null;
  if (!model) {
    return { ok: false, error: "Dieses Modell ist nicht vorgesehen." };
  }

  const written = await writeSettings({
    whisperModel: model,
    // Leer heißt: Sprache erkennen lassen.
    whisperLanguage: input.language.trim().slice(0, 8),
  });
  if (!written.ok) {
    return {
      ok: false,
      error: `Die Einstellung konnte nicht gespeichert werden: ${written.error}`,
    };
  }

  revalidatePath("/einstellungen");
  return {
    ok: true,
    message:
      `Neue Transkriptionen laufen mit ${model}` +
      (input.language.trim()
        ? ` und der Sprache ${input.language.trim()}.`
        : " und automatischer Spracherkennung."),
  };
}

/*
 * Die beiden Vorgänge, die Claude Code betreffen. Beide beginnen mit
 * assertAuthorMode: ein Zuschauer startet keine Prozesse und schreibt nicht
 * in die Bibliothek.
 */

/** Legt .claude/ in der Bibliothek an. Vorhandene Dateien bleiben unberührt. */
export async function installClaudeFilesAction(): Promise<ActionResult> {
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

  const result = await installClaudeFiles();
  if (!result.ok)
    return { ok: false, error: result.error ?? "Fehlgeschlagen." };

  revalidatePath("/einstellungen");
  if (result.created.length === 0) {
    return {
      ok: true,
      message:
        "Alles schon da — die vorhandenen Dateien wurden nicht angetastet.",
    };
  }
  return {
    ok: true,
    message:
      `${result.created.length} Dateien angelegt` +
      (result.kept.length > 0
        ? `, ${result.kept.length} vorhandene unberührt gelassen.`
        : ".") +
      " Ein „claude“ im Bibliotheksordner findet sie von selbst.",
  };
}

/**
 * Die Befehle, die die ganze Bibliothek betreffen: /themen, /glossar,
 * /kapitel-alle. Öffnet ein sichtbares Fenster — absichtlich, man muss
 * mitlesen, was in die eigenen Dateien geschrieben wird.
 */
export async function startLibraryClaudeAction(
  command: ClaudeCommand,
): Promise<ActionResult> {
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

  const result = await launchClaude(command);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    message: `Ein Fenster mit „${result.prompt}“ ist offen.`,
  };
}

/**
 * Stellt den Bibliotheksordner um — den Ordner also, in dem alles landet,
 * was hochgeladen wird.
 *
 * Ein leeres Feld stellt auf den Standard zurück. Das ist der Ausweg, wenn
 * ein Netzlaufwerk nicht mehr da ist: nichts zu tippen bringt einen zurück
 * in die lokale Bibliothek.
 */
export async function setLibraryDirAction(dir: string): Promise<ActionResult> {
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

  const result = await switchLibrary(dir);
  if (!result.ok) return { ok: false, error: result.error };

  invalidateTranscripts();
  invalidateSearchIndex();
  revalidatePath("/", "layout");

  const what = result.reset
    ? `Zurück auf den Standard: ${result.dir}.`
    : `Bibliothek ist jetzt ${result.dir}.`;
  const found = result.fresh
    ? " Der Ordner ist noch leer — der erste Import legt medien/ an."
    : ` ${result.items} ${result.items === 1 ? "Beitrag" : "Beiträge"} gelesen.`;

  return {
    ok: true,
    message: what + found + (result.note ? ` ${result.note}` : ""),
  };
}
