import { ITEM_FILES } from "@/lib/paths";
import type { Attachment, Item, LinkTarget, Slug } from "./types";

/*
 * Adressen an einer Stelle. Bewusst ohne "server-only": Client-Komponenten
 * brauchen dieselben URLs.
 */

/** Die abspielbare Datei. Die URL endet auf die echte Endung, damit "Video speichern unter" und VLC funktionieren. */
export function mediaUrl(item: Item): string | null {
  if (!item.assets.mediaName) return null;
  return `/api/medien/${item.slug}/${encodeURIComponent(item.assets.mediaName)}`;
}

export function posterUrl(item: Item): string | null {
  if (!item.assets.posterFile) return null;
  return `/api/medien/${item.slug}/${ITEM_FILES.poster}`;
}

export function transcriptVttUrl(item: Item): string | null {
  if (!item.assets.transcriptVttFile) return null;
  return `/api/medien/${item.slug}/${ITEM_FILES.transcriptVtt}`;
}

export function attachmentUrl(slug: Slug, attachment: Attachment): string {
  return `/api/medien/${slug}/${ITEM_FILES.attachments}/${encodeURIComponent(
    attachment.file,
  )}`;
}

export function itemHref(slug: Slug, opts?: { t?: number; anchor?: string }): string {
  if (opts?.t !== undefined && Number.isFinite(opts.t)) {
    return `/medien/${slug}?t=${Math.max(0, Math.round(opts.t))}`;
  }
  if (opts?.anchor) return `/medien/${slug}#${opts.anchor}`;
  return `/medien/${slug}`;
}

export function topicHref(slug: Slug): string {
  return `/themen/${slug}`;
}

export function collectionHref(slug: Slug): string {
  return `/sammlungen/${slug}`;
}

/**
 * Ein Ausschnitt einer Sammlung, abspielbar.
 *
 * Die Adresse trägt alles, was die Beitragsseite braucht: wo der Ausschnitt
 * beginnt (`t`), wo er endet (`bis`), und aus welcher Sammlung er an welcher
 * Stelle kommt (`sammlung`, `nr`). Damit ist die Ausschnitts-Wiedergabe
 * teilbar, überlebt einen Neuladen und braucht keinen Zustand im Browser.
 */
export function collectionPlayHref(
  collection: Slug,
  index: number,
  spot: { slug: Slug; target: LinkTarget },
): string {
  const params = new URLSearchParams();
  if (spot.target.kind === "zeit") {
    params.set("t", String(Math.max(0, Math.round(spot.target.start))));
    if (spot.target.end !== null) {
      params.set("bis", String(Math.round(spot.target.end)));
    }
  }
  params.set("sammlung", collection);
  params.set("nr", String(index + 1));
  const anchor =
    spot.target.kind === "abschnitt" ? `#${spot.target.anchor}` : "";
  return `/medien/${spot.slug}?${params.toString()}${anchor}`;
}

export function editHref(slug: Slug): string {
  return `/medien/${slug}/bearbeiten`;
}
