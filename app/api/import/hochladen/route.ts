import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { isAllowedHost, wrongHostMessage } from "@/lib/http/host";
import { cleanIncoming, importFile } from "@/lib/import/import-file";
import { enqueueAutoJobs } from "@/lib/jobs/auto";
import { startChain } from "@/lib/jobs/chain";
import { reloadLibrary } from "@/lib/library";
import {
  formatBytes,
  isMediaFile,
  isTextFile,
} from "@/lib/library/media-kind";
import { locateFfmpeg } from "@/lib/media/locate";
import { transcodeToMp3 } from "@/lib/media/transcode";
import { paths } from "@/lib/paths";

/*
 * Hochladen großer Dateien.
 *
 * Bewusst ein Route Handler mit rohem Body-Strom und KEINE Server Action:
 * serverActions.bodySizeLimit steht auf 1 MB, und Hochsetzen hilft nicht —
 * der Rumpf wird dabei geparst, also vollständig in den Speicher gelesen.
 * Dasselbe gilt für request.formData(). Bei mehreren Gigabyte ist das tödlich.
 *
 * Weil das keine Server Action ist, fehlt die eingebaute Origin-Prüfung. Sie
 * wird hier von Hand gemacht.
 *
 * Diese Route ist im Matcher von proxy.ts AUSGESCHLOSSEN, und das ist keine
 * Nachlässigkeit: der Proxy puffert jeden Rumpf im Arbeitsspeicher und kürzt
 * ihn still bei zehn Megabyte (Next-Doku, proxyClientMaxBodySize). Genau
 * daran sind importierte Videos exakt 10,0 MB groß geworden, ließen sich
 * nicht abspielen, und ffprobe konnte sie nicht lesen. Weil der Proxy hier
 * nicht läuft, macht die Route die Host-Prüfung selbst.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Nur Anfragen aus der eigenen Oberfläche. */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true; // Kein Origin: kein Browser-Formular, kein CSRF.
  try {
    const host = request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function PUT(request: Request) {
  try {
    await assertAuthorMode();
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof NotAllowedError
            ? error.message
            : "Hochladen ist nicht möglich.",
      },
      { status: 403 },
    );
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Verboten." }, { status: 403 });
  }

  /*
   * Was sonst der Proxy tut. Origin gegen Host zu vergleichen genügt dafür
   * nicht: bei DNS-Rebinding tragen beide den Namen des Angreifers.
   */
  const hostHeader = request.headers.get("host");
  if (!isAllowedHost(hostHeader)) {
    return Response.json(
      { error: wrongHostMessage(hostHeader).trim() },
      { status: 403 },
    );
  }
  if (!request.body) {
    return Response.json({ error: "Kein Inhalt." }, { status: 400 });
  }

  const url = new URL(request.url);
  const rawName = url.searchParams.get("name") ?? "";
  // Nur der Dateiname zählt; ein Pfad im Namen wird verworfen.
  const name = path.basename(rawName.replace(/\\/g, "/")).trim();
  const move = url.searchParams.get("verschieben") === "1";

  if (!name) {
    return Response.json({ error: "Ohne Dateinamen." }, { status: 400 });
  }
  if (!isMediaFile(name) && !isTextFile(name)) {
    return Response.json(
      {
        error:
          `"${name}" hat eine Endung, die die Mediathek nicht kennt. ` +
          "Erlaubt sind Video-, Audio- und Markdown-Dateien.",
      },
      { status: 415 },
    );
  }

  /*
   * Zwischenlager INNERHALB der Bibliothek: nur dann bleibt das
   * anschließende Verschieben auf demselben Volume und ist damit atomar.
   */
  const temporary = path.join(
    paths.incoming,
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.part`,
  );

  try {
    await fs.mkdir(paths.incoming, { recursive: true });
    /*
     * pipeline() aus node:stream/promises, nicht .pipe(): nur so werden
     * Fehler und Abbrüche sauber weitergegeben und die halbe Datei
     * aufgeräumt.
     */
    await pipeline(
      Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(temporary),
    );
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    return Response.json(
      {
        error: `Der Upload wurde abgebrochen: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 400 },
    );
  }

  /*
   * Ist auch alles angekommen?
   *
   * Diese Prüfung ist der Grund, warum der 10-MB-Fehler nicht ein zweites
   * Mal still passieren kann. Ein gekürzter Rumpf beendet den Strom ganz
   * regulär — pipeline() meldet Erfolg, die Datei ist halb, und erst Tage
   * später fällt auf, dass sich nichts abspielen lässt. Der Browser schickt
   * bei einem Upload immer eine Content-Length; weicht die abgelegte Größe
   * davon ab, wird abgelehnt statt eingelesen.
   *
   * Fängt zugleich den Fall "Netzwerk mitten im Hochladen weg".
   */
  const announced = Number(request.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > 0) {
    const written = (await fs.stat(temporary).catch(() => null))?.size ?? -1;
    if (written !== announced) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      return Response.json(
        {
          error:
            `Von "${name}" sind nur ${formatBytes(written)} von ` +
            `${formatBytes(announced)} angekommen. Die Datei wurde nicht ` +
            "eingelesen — bitte den Upload wiederholen.",
        },
        { status: 400 },
      );
    }
  }

  /*
   * Für den Rekorder unter /aufnehmen: der Browser liefert WebM/Opus, kein
   * Browser kann direkt MP3 aufnehmen. "wandeln=mp3" wandelt VOR dem
   * Einsortieren, damit audio.mp3 in der Bibliothek liegt wie jede andere
   * Sprachmemo-Datei — der Rest der Route bleibt für gewöhnliche Uploads
   * unverändert.
   */
  const istAufnahme = url.searchParams.get("wandeln") === "mp3";
  let sourceFile = temporary;
  let importName = name;
  if (istAufnahme) {
    const tools = await locateFfmpeg();
    if (!tools) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      return Response.json(
        { error: "ffmpeg wurde nicht gefunden — die Aufnahme kann nicht nach MP3 gewandelt werden." },
        { status: 500 },
      );
    }
    const mp3File = `${temporary}.mp3`;
    const converted = await transcodeToMp3(temporary, mp3File, tools);
    await fs.rm(temporary, { force: true }).catch(() => {});
    if (!converted.ok) {
      return Response.json({ error: converted.error }, { status: 500 });
    }
    sourceFile = mp3File;
    importName = `${path.parse(name).name}.mp3`;
  }

  const outcome = await importFile(sourceFile, {
    // Aus dem Zwischenlager wird immer verschoben — es ist eine Kopie.
    move: true,
    originalName: importName,
  });

  // Reste aus früheren Abbrüchen mitnehmen, kostet nichts.
  void cleanIncoming();

  if (!outcome.ok) {
    await fs.rm(sourceFile, { force: true }).catch(() => {});
    return Response.json({ error: outcome.error }, { status: 400 });
  }

  await reloadLibrary({ onlySlugs: [outcome.slug] });

  /*
   * Ab hier läuft es von selbst weiter: Kachelbild, Anhangtext,
   * Transkription. Angestellt, nicht abgewartet — der Upload soll antworten
   * und nicht eine Viertelstunde auf Whisper warten. Der Fortschritt steht
   * unter /auftraege.
   */
  const auto = await enqueueAutoJobs(outcome.slug);

  /*
   * Eine Aufnahme soll IMMER direkt transkribiert werden, unabhängig von der
   * Einstellung "Automatik nach Import" — aufnehmen ist selbst schon die
   * ausdrückliche Handlung. startChain() prüft für sich, was schon da ist
   * und was das Werkzeug (nicht) kann; ein Job, den enqueueAutoJobs() oben
   * schon angestellt hat, wird nicht doppelt angestellt.
   */
  if (istAufnahme) await startChain(outcome.slug);

  return Response.json({
    slug: outcome.slug,
    note: outcome.note,
    auto,
    // Nur zur Information: verschoben wird beim Hochladen nichts am Original.
    movedSource: move,
  });
}
