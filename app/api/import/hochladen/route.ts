import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { assertAuthorMode, NotAllowedError } from "@/lib/features";
import { cleanIncoming, importFile } from "@/lib/import/import-file";
import { reloadLibrary } from "@/lib/library";
import { isMediaFile, isTextFile } from "@/lib/library/media-kind";
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

  const outcome = await importFile(temporary, {
    // Aus dem Zwischenlager wird immer verschoben — es ist eine Kopie.
    move: true,
    originalName: name,
  });

  // Reste aus früheren Abbrüchen mitnehmen, kostet nichts.
  void cleanIncoming();

  if (!outcome.ok) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    return Response.json({ error: outcome.error }, { status: 400 });
  }

  await reloadLibrary({ onlySlugs: [outcome.slug] });
  return Response.json({
    slug: outcome.slug,
    note: outcome.note,
    // Nur zur Information: verschoben wird beim Hochladen nichts am Original.
    movedSource: move,
  });
}
