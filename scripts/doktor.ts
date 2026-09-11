/*
 * Liest die Bibliothek und berichtet, was drin ist und was nicht stimmt.
 *
 * Das nützlichste Werkzeug beim Anlegen der ersten echten Beiträge: es zeigt
 * dieselben Hinweise, die später in der Weboberfläche stehen, aber ohne
 * Server und in einem Rutsch.
 *
 *   npm run doktor
 *   MEDIATHEK_LIBRARY_DIR=S:\Mediathek npm run doktor
 *
 * Ohne Umgebungsvariable gilt derselbe Ordner wie in der Weboberfläche —
 * also der unter Einstellungen gewählte.
 */

import { getLibrary } from "@/lib/library";
import { applyStoredLibraryDir } from "@/lib/library/library-dir";
import { getTranscript } from "@/lib/library/transcript";
import { formatBytes } from "@/lib/library/media-kind";
import { formatTimecode } from "@/lib/library/chapters";
import type { LinkTarget } from "@/lib/library/types";

function line(text = "") {
  console.log(text);
}

function duration(seconds: number | null): string {
  return seconds === null
    ? "  ohne Dauer"
    : formatTimecode(seconds).padStart(12);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Wohin eine Fundstelle zeigt, in einer Zeile. */
function describeTarget(target: LinkTarget): string {
  if (target.kind === "zeit") {
    return target.end === null
      ? formatTimecode(target.start)
      : `${formatTimecode(target.start)}-${formatTimecode(target.end)}`;
  }
  if (target.kind === "abschnitt") return `#${target.anchor}`;
  return "ganz";
}

async function main() {
  await applyStoredLibraryDir();
  const library = await getLibrary();

  line(`Bibliothek: ${library.root}`);
  line(
    `Gelesen in ${library.scanDurationMs} ms — ` +
      `${plural(library.items.length, "Beitrag", "Beiträge")}, ` +
      `${plural(library.topics.length, "Thema", "Themen")}, ` +
      `${plural(library.collections.length, "Sammlung", "Sammlungen")}, ` +
      `${plural(library.questions.length, "Frage", "Fragen")}`,
  );
  if (!library.cache.writable && library.cache.note) {
    line(`Index: ${library.cache.note}`);
  }
  line();

  const byKind = { video: 0, audio: 0, text: 0 };
  for (const item of library.items) byKind[item.kind] += 1;
  line(
    `Arten: ${byKind.video} Video, ${byKind.audio} Audio, ${byKind.text} Text`,
  );
  if (library.tags.length > 0) {
    line(
      `Schlagworte: ${library.tags
        .map((entry) => `${entry.tag} (${entry.count})`)
        .join(", ")}`,
    );
  }
  line();

  let problemCount = 0;

  for (const item of library.items) {
    const kindLabel = { video: "Video", audio: "Audio", text: "Text " }[
      item.kind
    ];
    const chapters =
      item.chapters.length > 0 ? `${item.chapters.length} Kapitel` : "—";
    const size = item.assets.mediaBytes
      ? formatBytes(item.assets.mediaBytes)
      : "";
    line(
      `${kindLabel}  ${item.slug.padEnd(28)} ${duration(
        item.durationSeconds,
      )}  ${chapters.padEnd(11)} ${size}`,
    );
    line(`        ${item.title}`);

    const details: string[] = [];
    if (item.summary) details.push("Zusammenfassung");
    if (item.hasTranscript) {
      const transcript = await getTranscript(item.slug);
      details.push(
        transcript
          ? `Transkript (${transcript.segments.length} Segmente)`
          : "Transkript UNLESBAR",
      );
    }
    if (item.attachments.length > 0) {
      details.push(plural(item.attachments.length, "Anhang", "Anhänge"));
    }
    if (item.references.length > 0) {
      details.push(plural(item.references.length, "Bezug", "Bezüge"));
    }
    const backlinks = library.backlinks.get(item.slug) ?? [];
    if (backlinks.length > 0) {
      details.push(plural(backlinks.length, "Rückverweis", "Rückverweise"));
    }
    const topics = library.topicsByItem.get(item.slug) ?? [];
    if (topics.length > 0) {
      details.push(`Themen: ${topics.map((c) => c.title).join(", ")}`);
    }
    const spots = library.topicSpotsByItem.get(item.slug) ?? [];
    if (spots.length > 0) {
      details.push(
        `${plural(spots.length, "Fundstelle", "Fundstellen")}: ` +
          spots
            .map(
              (entry) =>
                `${describeTarget(entry.spot.target)} (${entry.topic.title})`,
            )
            .join(", "),
      );
    }
    if (details.length > 0) line(`        ${details.join(" · ")}`);

    for (const chapter of item.chapters) {
      const where =
        chapter.kind === "zeit"
          ? formatTimecode(chapter.start).padStart(8)
          : `#${chapter.anchor}`.padStart(8);
      const flag = chapter.kind === "zeit" && chapter.beyondEnd ? " [!]" : "";
      const summary = chapter.summary ? " *" : "";
      line(`          ${where}  ${chapter.title}${flag}${summary}`);
    }

    for (const problem of item.problems) {
      problemCount += 1;
      const at = problem.line ? ` (Zeile ${problem.line})` : "";
      line(`        ! ${problem.kind}${at}: ${problem.message}`);
    }
    line();
  }

  for (const topic of library.topics) {
    line(
      `Thema   ${topic.slug.padEnd(28)} ` +
        plural(topic.itemSlugs.length, "Teil", "Teile") +
        (topic.spots.length > 0
          ? `, ${plural(topic.spots.length, "Fundstelle", "Fundstellen")}`
          : ""),
    );
    line(`        ${topic.title}`);
    if (topic.synonyms.length > 0) {
      line(`        Synonyme: ${topic.synonyms.join(", ")}`);
    }
    for (const slug of topic.itemSlugs) {
      const missing = topic.missingSlugs.includes(slug);
      line(`          ${missing ? "FEHLT  " : "       "}${slug}`);
    }
    for (const spot of topic.spots) {
      line(
        `          ${describeTarget(spot.target).padStart(11)}  ` +
          `${spot.slug}${spot.note ? ` — ${spot.note}` : ""}`,
      );
    }
    for (const problem of topic.problems) {
      problemCount += 1;
      line(`        ! ${problem.kind}: ${problem.message}`);
    }
    if (topic.missingSlugs.length > 0) {
      problemCount += topic.missingSlugs.length;
    }
    line();
  }

  for (const collection of library.collections) {
    line(
      `Sammlung ${collection.slug.padEnd(27)} ` +
        (collection.query
          ? `gespeicherte Suche: ${collection.query}`
          : plural(collection.entries.length, "Ausschnitt", "Ausschnitte")),
    );
    line(`        ${collection.title}`);
    for (const entry of collection.entries) {
      const missing = collection.missingSlugs.includes(entry.slug);
      line(
        `          ${missing ? "FEHLT" : "     "} ` +
          `${describeTarget(entry.target).padStart(11)}  ` +
          `${entry.slug}${entry.note ? ` — ${entry.note}` : ""}`,
      );
    }
    for (const problem of collection.problems) {
      problemCount += 1;
      line(`        ! ${problem.kind}: ${problem.message}`);
    }
    problemCount += collection.missingSlugs.length;
    line();
  }

  for (const frage of library.questions) {
    line(
      `Frage    ${frage.slug.padEnd(27)} ` +
        `${plural(frage.spots.length, "Beleg", "Belege")}` +
        (frage.usedWeb ? ", auch aus dem Netz" : ""),
    );
    line(`        ${frage.question}`);
    for (const andere of frage.alsoAsked) {
      line(`        auch: ${andere}`);
    }
    for (const spot of frage.spots) {
      const missing = frage.missingSlugs.includes(spot.slug);
      line(
        `          ${missing ? "FEHLT" : "     "} ` +
          `${describeTarget(spot.target).padStart(11)}  ${spot.slug}`,
      );
    }
    for (const problem of frage.problems) {
      problemCount += 1;
      line(`        ! ${problem.kind}: ${problem.message}`);
    }
    problemCount += frage.missingSlugs.length;
    line();
  }

  if (library.problems.length > 0) {
    line("Nicht eingelesen:");
    for (const problem of library.problems) {
      problemCount += 1;
      line(`  ! ${problem.path}`);
      line(`    ${problem.message}`);
    }
    line();
  }

  line(
    problemCount === 0
      ? "Keine Auffälligkeiten."
      : `${plural(problemCount, "Hinweis", "Hinweise")}. ` +
          "Sie stehen auch in der Weboberfläche.",
  );
}

void main().catch((error) => {
  console.error("Die Bibliothek konnte nicht gelesen werden:");
  console.error(error);
  process.exit(1);
});
