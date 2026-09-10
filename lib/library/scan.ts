import fs from "node:fs/promises";
import path from "node:path";

import { ITEM_FILES, paths } from "@/lib/paths";
import { readMp4Info } from "@/lib/media/mp4-duration";
import { parseItemMarkdown } from "./beitrag-md";
import { emptyCache, sameFingerprint } from "./cache";
import type { LibraryCache } from "./cache";
import { parseTopicMarkdown } from "./topics";
import { isSlug } from "./slug";
import {
  attachmentMime,
  attachmentPreview,
  isDirectlyPlayable,
  mediaMime,
  pickMediaFile,
} from "./media-kind";
import type {
  Attachment,
  Topic,
  FileStamp,
  Fingerprint,
  Item,
  ItemAssets,
  ItemProblem,
  LibraryState,
  MediaKind,
  Reference,
  Slug,
} from "./types";

type ScanProblem = { path: string; message: string };

async function stamp(file: string): Promise<FileStamp | null> {
  try {
    const info = await fs.stat(file);
    if (!info.isFile()) return null;
    return { size: info.size, mtimeMs: Math.round(info.mtimeMs) };
  } catch {
    return null;
  }
}

/**
 * Ein Fingerprint über alle Anhänge zusammen. Genügt, um "hat sich etwas
 * geändert" zu beantworten, ohne jede Datei einzeln im Cache zu führen.
 */
async function attachmentsStamp(
  dir: string,
): Promise<{ stamp: FileStamp | null; files: Array<{ name: string; info: FileStamp }> }> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { stamp: null, files: [] };
  }

  const files: Array<{ name: string; info: FileStamp }> = [];
  let size = 0;
  let mtimeMs = 0;
  for (const name of entries) {
    // .text/ enthält den extrahierten Text für die Suche, kein Anhang.
    if (name.startsWith(".")) continue;
    const info = await stamp(path.join(dir, name));
    if (!info) continue;
    files.push({ name, info });
    size += info.size;
    mtimeMs = Math.max(mtimeMs, info.mtimeMs);
  }
  files.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return {
    stamp: files.length > 0 ? { size, mtimeMs } : null,
    files,
  };
}

async function buildAttachments(
  dir: string,
  files: ReadonlyArray<{ name: string; info: FileStamp }>,
  labels: ReadonlyMap<string, string>,
): Promise<Attachment[]> {
  const textDir = path.join(dir, ITEM_FILES.attachmentText);
  let extracted = new Set<string>();
  try {
    extracted = new Set(
      (await fs.readdir(textDir)).map((name) => name.toLowerCase()),
    );
  } catch {
    // Kein .text/-Ordner: dann ist eben nichts extrahiert.
  }

  return files.map((entry) => {
    const label = labels.get(entry.name.toLowerCase());
    return {
      file: entry.name,
      label: label || humanizeAttachmentName(entry.name),
      bytes: entry.info.size,
      mime: attachmentMime(entry.name),
      preview: attachmentPreview(entry.name),
      hasText: extracted.has(`${entry.name.toLowerCase()}.txt`),
    };
  });
}

/** "pruefzettel-elios.pdf" → "Pruefzettel elios" */
function humanizeAttachmentName(name: string): string {
  const base = path.parse(name).name.replace(/[_-]+/g, " ").trim();
  if (!base) return name;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Liest einen Beitragsordner. Genau ein readdir plus die stats der bekannten
 * Dateien — kein rekursiver Durchlauf. Auf SMB kostet jeder Roundtrip 5 bis
 * 50 ms, und bei 500 Ordnern summiert sich das.
 */
async function scanItem(
  slug: Slug,
  cached: LibraryCache["items"][string] | undefined,
  force: boolean,
): Promise<{ item: Item | null; problem: ScanProblem | null }> {
  const dir = path.join(paths.items, slug);

  let entries: string[];
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch (error) {
    return {
      item: null,
      problem: {
        path: dir,
        message: `Ordner nicht lesbar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }

  const markdownName = entries.find(
    (name) => name.toLowerCase() === ITEM_FILES.markdown,
  );
  const media = pickMediaFile(entries);
  const posterName = entries.find(
    (name) => name.toLowerCase() === ITEM_FILES.poster,
  );
  const transcriptJsonName = entries.find(
    (name) => name.toLowerCase() === ITEM_FILES.transcriptJson,
  );
  const transcriptVttName = entries.find(
    (name) => name.toLowerCase() === ITEM_FILES.transcriptVtt,
  );

  if (!markdownName && !media) {
    return {
      item: null,
      problem: {
        path: dir,
        message:
          "Weder eine Mediendatei noch beitrag.md — der Ordner wird " +
          "übersprungen.",
      },
    };
  }

  const attachmentsDir = path.join(dir, ITEM_FILES.attachments);
  const attachmentInfo = await attachmentsStamp(attachmentsDir);

  const fingerprint: Fingerprint = {
    markdown: markdownName ? await stamp(path.join(dir, markdownName)) : null,
    media: media ? await stamp(path.join(dir, media.name)) : null,
    poster: posterName ? await stamp(path.join(dir, posterName)) : null,
    transcript: transcriptJsonName
      ? await stamp(path.join(dir, transcriptJsonName))
      : null,
    attachments: attachmentInfo.stamp,
  };

  if (!force && cached && sameFingerprint(cached.fingerprint, fingerprint)) {
    return { item: cached.item, problem: null };
  }

  const problems: ItemProblem[] = [];
  const kind: MediaKind = media ? media.kind : "text";

  if (!markdownName) {
    problems.push({
      kind: "datei",
      message:
        "Es gibt keine beitrag.md — Titel und Beschreibung fehlen deshalb. " +
        "Über den Bearbeiten-Knopf lässt sie sich anlegen.",
    });
  }

  /*
   * Dauer: der Kopf der Datei zuerst, sonst aus dem mvhd-Atom. Das kostet
   * nur ein paar Roundtrips und macht den Import auch auf einer Maschine
   * ohne ffmpeg brauchbar.
   */
  let fallbackDuration: number | null = null;
  if (media) {
    const info = await readMp4Info(path.join(dir, media.name));
    fallbackDuration = info.durationSeconds;
  }

  let raw = "";
  if (markdownName) {
    try {
      raw = await fs.readFile(path.join(dir, markdownName), "utf8");
    } catch (error) {
      problems.push({
        kind: "datei",
        message: `beitrag.md ist nicht lesbar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  const parsed = parseItemMarkdown(raw, { slug, kind, fallbackDuration });
  problems.push(...parsed.problems);

  if (media && !isDirectlyPlayable(media.name)) {
    problems.push({
      kind: "datei",
      message:
        `Das Format von ${media.name} spielt der Browser nicht unbedingt ` +
        "direkt ab (typisch bei H.265/HEVC aus Handy oder Drohne). " +
        "Eine Web-Fassung schafft Abhilfe.",
    });
  }

  const attachments = await buildAttachments(
    attachmentsDir,
    attachmentInfo.files,
    parsed.attachmentLabels,
  );
  for (const [file] of parsed.attachmentLabels) {
    if (!attachments.some((entry) => entry.file.toLowerCase() === file)) {
      problems.push({
        kind: "anhang",
        message: `Für "${file}" gibt es eine Beschriftung, aber keine Datei.`,
      });
    }
  }

  /*
   * Eine im Kopf genannte Web-Fassung hat Vorrang beim Abspielen — die
   * Originaldatei bleibt aber liegen und wird nie überschrieben.
   */
  let playName = media?.name ?? null;
  if (media && parsed.frontmatter.webVersion) {
    const wanted = parsed.frontmatter.webVersion;
    const found = entries.find(
      (name) => name.toLowerCase() === wanted.toLowerCase(),
    );
    if (found) {
      playName = found;
    } else {
      problems.push({
        kind: "frontmatter",
        message: `Die Web-Fassung "${wanted}" liegt nicht im Ordner.`,
      });
    }
  }

  /*
   * Die turbopackIgnore-Kommentare sind kein Beiwerk: ohne sie schließt der
   * Tracer aus dem dynamisch gebauten Pfad, dass das GANZE Projekt zur
   * Laufzeit gebraucht wird, und packt alle Quelldateien samt
   * Entwicklungsbibliothek in den standalone-Build. Das portable
   * Viewer-Paket wäre dann um ein Vielfaches größer als nötig.
   *
   * Der Pfad ist tatsächlich fest umschlossen: `dir` kommt immer aus
   * paths.items, und `playName` ist ein von pickMediaFile geprüfter
   * Dateiname aus genau diesem Ordner.
   */
  const mediaStamp = playName
    ? await stamp(path.join(/* turbopackIgnore: true */ dir, playName))
    : null;

  const assets: ItemAssets = {
    dir,
    markdownFile: path.join(dir, ITEM_FILES.markdown),
    mediaFile: playName
      ? path.join(/* turbopackIgnore: true */ dir, playName)
      : null,
    mediaName: playName,
    mediaBytes: mediaStamp?.size ?? null,
    mediaMime: playName ? mediaMime(playName) : null,
    posterFile: posterName ? path.join(dir, posterName) : null,
    transcriptJsonFile: transcriptJsonName
      ? path.join(dir, transcriptJsonName)
      : null,
    transcriptVttFile: transcriptVttName
      ? path.join(dir, transcriptVttName)
      : null,
    attachmentsDir: attachments.length > 0 ? attachmentsDir : null,
  };

  let addedAtMs = Date.now();
  try {
    const dirInfo = await fs.stat(dir);
    // birthtime ist auf manchen Dateisystemen 0 — dann die mtime nehmen.
    addedAtMs = dirInfo.birthtimeMs > 0 ? dirInfo.birthtimeMs : dirInfo.mtimeMs;
  } catch {
    // Bleibt bei "jetzt"; nur die Sortierung leidet.
  }

  const changedAtMs = Math.max(
    fingerprint.markdown?.mtimeMs ?? 0,
    fingerprint.media?.mtimeMs ?? 0,
    fingerprint.transcript?.mtimeMs ?? 0,
    fingerprint.attachments?.mtimeMs ?? 0,
    addedAtMs,
  );

  const item: Item = {
    slug,
    kind,
    title: parsed.title,
    tags: parsed.frontmatter.tags,
    recorded: parsed.frontmatter.recorded,
    durationSeconds: parsed.durationSeconds,
    description: parsed.description,
    chapters: parsed.chapters,
    summary: parsed.summary,
    references: parsed.references,
    attachments,
    hasTranscript: transcriptJsonName !== undefined,
    // Wird erst beim Öffnen des Transkripts gelesen, nie beim Scan.
    transcriptSegmentCount: null,
    assets,
    problems,
    fingerprint,
    addedAtMs,
    changedAtMs,
  };

  return { item, problem: null };
}

async function scanTopics(
  cache: LibraryCache,
  force: boolean,
): Promise<{
  topics: Topic[];
  cacheEntries: LibraryCache["topics"];
  problems: ScanProblem[];
}> {
  const problems: ScanProblem[] = [];
  const cacheEntries: LibraryCache["topics"] = {};
  const topics: Topic[] = [];

  let entries: string[];
  try {
    entries = (await fs.readdir(paths.topics, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    // Kein themen/-Ordner ist völlig in Ordnung.
    return { topics, cacheEntries, problems };
  }

  for (const name of entries) {
    const slug = path.parse(name).name.toLowerCase();
    if (!isSlug(slug)) {
      problems.push({
        path: path.join(paths.topics, name),
        message:
          "Der Dateiname taugt nicht als Kennung eines Themas " +
          "(erlaubt: Kleinbuchstaben, Ziffern, Bindestriche).",
      });
      continue;
    }

    const file = path.join(paths.topics, name);
    const info = await stamp(file);
    if (!info) continue;

    const cached = cache.topics[slug];
    if (
      !force &&
      cached &&
      cached.size === info.size &&
      cached.mtimeMs === info.mtimeMs
    ) {
      topics.push(cached.topic);
      cacheEntries[slug] = cached;
      continue;
    }

    let raw = "";
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      problems.push({
        path: file,
        message: `Nicht lesbar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      continue;
    }

    const parsed = parseTopicMarkdown(raw, slug);
    const topic: Topic = {
      slug,
      title: parsed.title,
      description: parsed.description,
      itemSlugs: parsed.itemSlugs,
      missingSlugs: [],
      tags: parsed.tags,
      changedAtMs: info.mtimeMs,
      problems: parsed.problems,
    };
    topics.push(topic);
    cacheEntries[slug] = { size: info.size, mtimeMs: info.mtimeMs, topic };
  }

  topics.sort((a, b) => a.title.localeCompare(b.title, "de"));
  return { topics, cacheEntries, problems };
}

export type ScanResult = {
  state: LibraryState;
  cache: LibraryCache;
  reparsed: number;
};

/**
 * Liest die ganze Bibliothek. `onlySlugs` beschränkt das Neu-Einlesen auf
 * die vom Watcher gemeldeten Beiträge; alle übrigen kommen aus dem Cache.
 */
export async function scanLibrary(options: {
  cache: LibraryCache | null;
  force?: boolean;
  onlySlugs?: readonly Slug[] | null;
  generation: number;
}): Promise<ScanResult> {
  const startedAt = Date.now();
  const force = options.force ?? false;
  const cache = options.cache ?? emptyCache();
  const onlySlugs = options.onlySlugs ? new Set(options.onlySlugs) : null;

  const problems: ScanProblem[] = [];
  const nextCacheItems: LibraryCache["items"] = {};
  const items: Item[] = [];
  let reparsed = 0;

  let dirNames: string[] = [];
  try {
    dirNames = (await fs.readdir(paths.items, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    problems.push({
      path: paths.items,
      message:
        code === "ENOENT"
          ? 'Der Ordner "medien" fehlt. Er wird beim ersten Import angelegt.'
          : `Nicht lesbar: ${
              error instanceof Error ? error.message : String(error)
            }`,
    });
  }

  for (const name of dirNames) {
    if (name.startsWith(".")) continue;
    const slug = name.toLowerCase();

    if (!isSlug(slug)) {
      problems.push({
        path: path.join(paths.items, name),
        message:
          `Der Ordnername "${name}" ist als Kennung nicht brauchbar ` +
          "(erlaubt: Kleinbuchstaben, Ziffern, Bindestriche). " +
          "Der Beitrag wird nicht angezeigt.",
      });
      continue;
    }
    if (name !== slug) {
      problems.push({
        path: path.join(paths.items, name),
        message:
          `Der Ordner "${name}" enthält Großbuchstaben. Er wird als ` +
          `"${slug}" geführt; bitte umbenennen.`,
      });
    }

    const cached = cache.items[slug];
    // Ein Beitrag, der nicht neu gelesen werden muss, kostet nur die stats.
    const skipParse = onlySlugs !== null && !onlySlugs.has(slug);
    const result = await scanItem(slug, cached, force && !skipParse);
    if (result.problem) {
      problems.push(result.problem);
      continue;
    }
    if (!result.item) continue;

    if (result.item !== cached?.item) reparsed += 1;
    items.push(result.item);
    nextCacheItems[slug] = {
      fingerprint: result.item.fingerprint,
      item: result.item,
    };
  }

  // Neueste zuerst; ohne Datum nach Titel.
  items.sort((a, b) => {
    if (a.recorded && b.recorded && a.recorded !== b.recorded) {
      return a.recorded < b.recorded ? 1 : -1;
    }
    if (a.recorded && !b.recorded) return -1;
    if (!a.recorded && b.recorded) return 1;
    return a.title.localeCompare(b.title, "de");
  });

  const bySlug = new Map(items.map((item) => [item.slug, item]));

  const topicResult = await scanTopics(cache, force);
  problems.push(...topicResult.problems);
  for (const topic of topicResult.topics) {
    topic.missingSlugs = topic.itemSlugs.filter((slug) => !bySlug.has(slug));
  }

  const topicsBySlug = new Map(
    topicResult.topics.map((topic) => [topic.slug, topic]),
  );
  const topicsByItem = new Map<Slug, Topic[]>();
  for (const topic of topicResult.topics) {
    for (const slug of topic.itemSlugs) {
      if (!bySlug.has(slug)) continue;
      const list = topicsByItem.get(slug);
      if (list) list.push(topic);
      else topicsByItem.set(slug, [topic]);
    }
  }

  /*
   * Rückverweise werden berechnet, nicht geschrieben: ein Bezug wird an einer
   * Stelle notiert und erscheint auf beiden Beiträgen. Sonst müsste Claude
   * Code jede Beziehung zweimal pflegen und beide Seiten konsistent halten.
   */
  const backlinks = new Map<Slug, Reference[]>();
  for (const item of items) {
    for (const reference of item.references) {
      if (!bySlug.has(reference.to)) {
        item.problems.push({
          kind: "bezug",
          message: `Der Verweis auf "${reference.to}" findet kein Ziel.`,
          line: reference.sourceLine,
        });
        continue;
      }
      const list = backlinks.get(reference.to);
      if (list) list.push(reference);
      else backlinks.set(reference.to, [reference]);
    }
  }

  const tagCounts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) =>
      b.count === a.count ? a.tag.localeCompare(b.tag, "de") : b.count - a.count,
    );

  const state: LibraryState = {
    generation: options.generation,
    root: paths.library,
    scannedAtMs: Date.now(),
    scanDurationMs: Date.now() - startedAt,
    items,
    bySlug,
    topics: topicResult.topics,
    topicsBySlug,
    topicsByItem,
    backlinks,
    tags,
    problems,
    cache: { readable: options.cache !== null, writable: true, note: null },
    watch: { mode: "aus", error: null },
  };

  return {
    state,
    cache: {
      version: cache.version,
      appVersion: cache.appVersion,
      generatedAtMs: Date.now(),
      libraryPath: paths.library,
      items: nextCacheItems,
      topics: topicResult.cacheEntries,
    },
    reparsed,
  };
}
