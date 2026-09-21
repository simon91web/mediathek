"use server";

import { revalidatePath } from "next/cache";

import { installInstructions } from "@/lib/assistant/install";
import { launchAssistant } from "@/lib/assistant/start";
import type { AssistantTask } from "@/lib/assistant/start";
import {
  assertAuthorMode,
  getFeatures,
  invalidateFeatures,
  NotAllowedError,
} from "@/lib/features";
import { reloadLibrary } from "@/lib/library";
import { switchLibrary } from "@/lib/library/switch";
import { libraryRoot } from "@/lib/paths";
import { openInFileManager } from "@/lib/shell/open-folder";
import { pickFolder } from "@/lib/shell/pick-folder";
import { createDesktopShortcut } from "@/lib/shell/shortcut";
import { invalidateTranscripts } from "@/lib/library/transcript";
import { invalidateSearchIndex } from "@/lib/search";
import {
  isReadonly,
  isToolName,
  WHISPER_MODELS,
  writeSettings,
} from "@/lib/settings";
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

/** Merkt sich das Verzeichnis mit ffmpeg und ffprobe. */
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
        `In "${trimmed}" ließ sich ffprobe nicht aufrufen. Erwartet wird ` +
        "das Verzeichnis, in dem ffmpeg und ffprobe liegen.",
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
export async function installInstructionsAction(): Promise<ActionResult> {
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

  const result = await installInstructions();
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
export async function startLibraryAssistantAction(
  command: AssistantTask,
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

  const result = await launchAssistant(command);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    message:
      `Ein Fenster mit „${result.prompt}“ ist offen — dort arbeitet das ` +
      "KI-Werkzeug, und dort kann man mitlesen und nachfragen. Es liegt " +
      "womöglich hinter diesem Fenster. Die Mediathek zeigt die Änderungen, " +
      "sobald die Dateien geschrieben sind.",
  };
}

export type PickResult =
  | { ok: true; dir: string }
  | { ok: false; canceled: boolean; error?: string };

/**
 * Öffnet den Ordner-Dialog des Betriebssystems für das Umstellen der
 * Bibliothek. Wie beim Begrüßungsschirm geht nichts hinein und nichts wird
 * dabei umgestellt — erst ein anschließendes "Übernehmen" ruft
 * setLibraryDirAction mit dem gewählten Pfad auf.
 */
export async function pickLibraryFolderAction(): Promise<PickResult> {
  const result = await pickFolder();
  if (result.ok) return { ok: true, dir: result.dir };
  if (result.canceled) return { ok: false, canceled: true };
  return { ok: false, canceled: false, error: result.error };
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
  /*
   * Kein Autorenmodus: den Ordner zu wechseln ist keine Änderung IN der
   * Bibliothek, sondern die Wahl, welche Bibliothek gezeigt wird. Der
   * einzige Riegel bleibt MEDIATHEK_LIBRARY_DIR (switchLibrary).
   */
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

/**
 * Öffnet den Bibliotheksordner im Explorer.
 *
 * Der Pfad kommt aus libraryRoot() und nie aus der Anfrage — ein Pfad von
 * außen wäre hier ein "öffne mir irgendetwas auf dem Rechner".
 */
export async function openLibraryFolderAction(): Promise<ActionResult> {
  const dir = libraryRoot();
  const result = await openInFileManager(dir);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `Ordner geöffnet: ${dir}` };
}

/** Schaltet die Automatik nach dem Import ein oder aus. */
export async function setAutoJobsAction(
  enabled: boolean,
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

  const written = await writeSettings({ autoJobs: enabled });
  if (!written.ok) {
    return {
      ok: false,
      error: `Die Einstellung konnte nicht gespeichert werden: ${written.error}`,
    };
  }

  revalidatePath("/einstellungen");
  return {
    ok: true,
    message: enabled
      ? "Nach einem Import wird von selbst transkribiert."
      : "Die Automatik ist aus. Aufträge lassen sich am Beitrag anstellen.",
  };
}

/**
 * Legt fest, welches Kommandozeilenwerkzeug die Texte erzeugt.
 *
 * Nur der Programmname, kein Pfad — es muss im Suchpfad stehen. Die
 * Anleitungen in der Bibliothek setzen kein bestimmtes Programm voraus, sie
 * beschreiben Dateien; deshalb ist das hier eine freie Wahl und keine Liste.
 */
export async function setAssistantCommandAction(input: {
  command: string;
  args: string;
}): Promise<ActionResult> {
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

  const command = input.command.trim();
  if (!isToolName(command)) {
    return {
      ok: false,
      error:
        'Erwartet wird nur der Programmname, etwa "claude" oder "codex" ' +
        "— ohne Pfad, ohne Leerzeichen. Das Programm muss im Suchpfad stehen.",
    };
  }

  const args = input.args.trim().split(/\s+/).filter(Boolean);
  const schlecht = args.find((wert) => !isToolName(wert));
  if (schlecht) {
    return {
      ok: false,
      error: `"${schlecht}" ist als Argument nicht zulässig.`,
    };
  }

  const written = await writeSettings({
    assistantCommand: command,
    assistantArgs: args.slice(0, 4),
  });
  if (!written.ok) {
    return {
      ok: false,
      error: `Die Einstellung konnte nicht gespeichert werden: ${written.error}`,
    };
  }

  invalidateFeatures();
  const features = await getFeatures(true);
  revalidatePath("/einstellungen");

  if (features.assistant !== "ok") {
    return {
      ok: false,
      error:
        `"${command}" ließ sich nicht aufrufen. Steht es im Suchpfad? ` +
        'Geprüft wird mit "' +
        command +
        ' --version".',
    };
  }

  return {
    ok: true,
    message:
      `"${command}" ist eingerichtet` +
      (args.length > 0 ? ` (Argumente: ${args.join(" ")})` : "") +
      ". Die Knöpfe unten benutzen es ab jetzt.",
  };
}

/**
 * Schaltet den Chat ein oder aus und merkt die Argumente für den
 * einmaligen Aufruf.
 */
/**
 * Die unbeaufsichtigten KI-Schritte — Voraussetzung für die Kette.
 *
 * Eigene Einstellung und nicht an den Chat gehängt: hier geht es nicht ums
 * Lesen, sondern ums Schreiben ohne Zuschauer. Das ist die größere
 * Entscheidung von beiden.
 */
export async function setAutoAssistantAction(input: {
  enabled: boolean;
  args: string;
  chain: boolean;
}): Promise<ActionResult> {
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

  const args = input.args.trim().split(/\s+/).filter(Boolean);
  const schlecht = args.find((wert) => !isToolName(wert));
  if (schlecht) {
    return {
      ok: false,
      error: `"${schlecht}" ist als Argument nicht zulässig.`,
    };
  }
  if (input.enabled && args.length === 0) {
    return {
      ok: false,
      error:
        "Ohne Argumente läuft das nicht: das Werkzeug braucht den " +
        "Einmal-Aufruf und die Erlaubnis zu schreiben.",
    };
  }

  const written = await writeSettings({
    autoAssistant: input.enabled,
    autoAssistantArgs: args.slice(0, 8),
    // Ohne unbeaufsichtigte Schritte gibt es auch keine Kette nach dem Import.
    autoChain: input.enabled ? input.chain : false,
  });
  if (!written.ok) {
    return {
      ok: false,
      error: `Die Einstellung konnte nicht gespeichert werden: ${written.error}`,
    };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    message: input.enabled
      ? `KI-Schritte ohne Fenster sind an. Aufgerufen wird "${
          (await getFeatures()).assistantCommand
        } ${args.join(" ")}".`
      : "KI-Schritte laufen nur noch im sichtbaren Fenster.",
  };
}

export async function setChatAction(input: {
  enabled: boolean;
  args: string;
  webAllowed?: boolean;
  webArgs?: string;
}): Promise<ActionResult> {
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

  const args = input.args.trim().split(/\s+/).filter(Boolean);
  const webArgs = (input.webArgs ?? "").trim().split(/\s+/).filter(Boolean);
  const schlecht = [...args, ...webArgs].find((wert) => !isToolName(wert));
  if (schlecht) {
    return {
      ok: false,
      error: `"${schlecht}" ist als Argument nicht zulässig.`,
    };
  }

  const written = await writeSettings({
    chatEnabled: input.enabled,
    chatArgs: args.slice(0, 4),
    ...(input.webAllowed === undefined
      ? {}
      : { chatWebAllowed: input.webAllowed }),
    ...(input.webArgs === undefined
      ? {}
      : { chatWebArgs: webArgs.slice(0, 6) }),
  });
  if (!written.ok) {
    return {
      ok: false,
      error: `Die Einstellung konnte nicht gespeichert werden: ${written.error}`,
    };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    message: input.enabled
      ? `Der Chat ist an. Aufgerufen wird "${(await getFeatures()).assistantCommand} ${args.join(" ")}".`
      : "Der Chat ist aus.",
  };
}

/**
 * Legt eine Verknüpfung auf dem Schreibtisch an, die ohne Konsolenfenster
 * startet.
 *
 * Auf Klick und nicht im Paket: eine Verknüpfung merkt sich einen absoluten
 * Pfad, und das Paket ist zum Kopieren gedacht — mitgeliefert zählte sie
 * nach dem ersten Verschieben ins Leere.
 */
export async function createShortcutAction(): Promise<ActionResult> {
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

  const result = await createDesktopShortcut();
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    message: `Angelegt: ${result.file}. Ein Doppelklick darauf startet die Mediathek ohne Konsolenfenster.`,
  };
}

/**
 * Richtet die Python-Umgebung ein — als Auftrag, damit man zusehen kann.
 *
 * Im weitergegebenen Paket gibt es kein npm; der frühere Hinweis
 * „einzurichten mit npm run setup:python" nannte dort einen Befehl, den es
 * auf der Maschine nicht gibt. Gerufen wird dasselbe Skript mit der node.exe,
 * die ohnehin im Paket liegt.
 */
export async function setupPythonAction(options: {
  cpu?: boolean;
}): Promise<ActionResult> {
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

  const { startLibraryJob } = await import("@/lib/jobs");
  /*
   * Der „Beitrag" eines bibliotheksweiten Auftrags ist leer; hier steht
   * stattdessen „cpu“, wenn ohne Grafikkarte eingerichtet werden soll. Das
   * spart eine zweite Auftragsart für denselben Ablauf.
   */
  const started = await startLibraryJob(
    "pythonsetup",
    options.cpu ? "Python (ohne Grafikkarte)" : "Python für die Transkription",
    options.cpu ? "cpu" : "",
  );
  if (!started.ok) return { ok: false, error: started.error };

  revalidatePath("/", "layout");
  return {
    ok: true,
    message:
      "Das Einrichten läuft. Es lädt einige hundert Megabyte und dauert " +
      "beim ersten Mal Minuten — der Fortschritt steht bei den Aufträgen.",
  };
}

/**
 * Merkt sich, dass der Rundgang durch die Oberfläche gezeigt wurde (fertig
 * durchlaufen oder übersprungen) — er öffnet sich dann nicht noch einmal von
 * selbst. Kein assertAuthorMode: das ist keine privilegierte Änderung, nur
 * eine stille Notiz für den nächsten Start.
 */
export async function markPlatformTourSeenAction(): Promise<ActionResult> {
  const written = await writeSettings({ platformTourSeen: true });
  if (!written.ok) {
    return {
      ok: false,
      error: `Die Einstellung konnte nicht gespeichert werden: ${written.error}`,
    };
  }
  return { ok: true, message: "" };
}
