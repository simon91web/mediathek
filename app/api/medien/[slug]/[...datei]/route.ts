import path from "node:path";

import { serveFile } from "@/lib/http/serve-file";
import { getItem } from "@/lib/library";
import { attachmentMime } from "@/lib/library/media-kind";
import { isSlug } from "@/lib/library/slug";
import type { Item } from "@/lib/library/types";
import { ITEM_FILES, paths } from "@/lib/paths";

/*
 * Liefert Mediendateien, Kachelbilder, Transkripte und Anhänge aus.
 *
 * Die entscheidende Sicherheitsregel: diese Route baut NIEMALS einen Pfad aus
 * Nutzereingabe. Sie schlägt den Slug im Index nach und benutzt den dort
 * gespeicherten absoluten Pfad. Ein Ausbruch aus dem Bibliotheksordner ist
 * damit strukturell unmöglich, nicht bloß gefiltert.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Resolved = {
  file: string;
  mime: string;
  immutable: boolean;
  downloadName?: string;
};

function resolveAsset(item: Item, segments: string[]): Resolved | null {
  if (segments.length === 1) {
    const name = segments[0];

    if (item.assets.mediaName && name === item.assets.mediaName) {
      return {
        file: item.assets.mediaFile!,
        mime: item.assets.mediaMime ?? "application/octet-stream",
        immutable: true,
      };
    }
    if (name === ITEM_FILES.poster && item.assets.posterFile) {
      return { file: item.assets.posterFile, mime: "image/jpeg", immutable: true };
    }
    if (name === ITEM_FILES.transcriptVtt && item.assets.transcriptVttFile) {
      return {
        file: item.assets.transcriptVttFile,
        mime: "text/vtt; charset=utf-8",
        immutable: false,
      };
    }
    if (name === ITEM_FILES.transcriptJson && item.assets.transcriptJsonFile) {
      return {
        file: item.assets.transcriptJsonFile,
        mime: "application/json; charset=utf-8",
        immutable: false,
      };
    }
    return null;
  }

  if (segments.length === 2 && segments[0] === ITEM_FILES.attachments) {
    // Nur was im Index als Anhang steht, wird ausgeliefert.
    const attachment = item.attachments.find(
      (entry) => entry.file === segments[1],
    );
    if (!attachment || !item.assets.attachmentsDir) return null;
    return {
      file: path.join(item.assets.attachmentsDir, attachment.file),
      mime: attachmentMime(attachment.file),
      immutable: true,
      // PDFs und Bilder zeigt der Browser; alles andere wird geladen.
      downloadName:
        attachment.preview === "keine" ? attachment.file : undefined,
    };
  }

  return null;
}

async function handle(
  request: Request,
  context: { params: Promise<{ slug: string; datei: string[] }> },
): Promise<Response> {
  const { slug, datei } = await context.params;

  // Billiger Vorfilter. Immer 404, nie ein sprechender Fehler: kein Leck
  // darüber, was existiert und was nicht.
  if (!isSlug(slug)) return new Response("Nicht gefunden", { status: 404 });
  if (!Array.isArray(datei) || datei.length === 0 || datei.length > 2) {
    return new Response("Nicht gefunden", { status: 404 });
  }

  const item = await getItem(slug);
  if (!item) return new Response("Nicht gefunden", { status: 404 });

  const resolved = resolveAsset(item, datei);
  if (!resolved) return new Response("Nicht gefunden", { status: 404 });

  /*
   * Sicherheitsgurt: der aufgelöste Pfad muss unterhalb von medien/ liegen.
   * Nach der Index-Suche kann er das nicht verletzen — aber falls jemand
   * später eine Abkürzung einbaut, schlägt es hier fehl und nicht beim Nutzer.
   */
  const relative = path.relative(paths.items, resolved.file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    console.error(`[medien] Pfad ausserhalb der Bibliothek: ${resolved.file}`);
    return new Response("Nicht gefunden", { status: 404 });
  }

  return serveFile(request, resolved);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; datei: string[] }> },
) {
  return handle(request, context);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ slug: string; datei: string[] }> },
) {
  return handle(request, context);
}
