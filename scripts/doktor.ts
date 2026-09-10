/*
 * Liest die Bibliothek und berichtet, was drin ist und was nicht stimmt.
 *
 * Das nützlichste Werkzeug beim Anlegen der ersten echten Beiträge: es zeigt
 * dieselben Hinweise, die später in der Weboberfläche stehen, aber ohne
 * Server und in einem Rutsch.
 *
 *   npm run doktor
 *   MEDIATHEK_LIBRARY_DIR=S:\Mediathek npm run doktor
 */

import { getLibrary } from "@/lib/library";
import { getTranscript } from "@/lib/library/transcript";
import { formatBytes } from "@/lib/library/media-kind";
import { formatTimecode } from "@/lib/library/chapters";

function line(text = "") {
  console.log(text);
}

function duration(seconds: number | null): string {
  return seconds === null ? "  ohne Dauer" : formatTimecode(seconds).padStart(12);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

async function main() {
  const library = await getLibrary();

  line(`Bibliothek: ${library.root}`);
  line(
    `Gelesen in ${library.scanDurationMs} ms — ` +
      `${plural(library.items.length, "Beitrag", "Beiträge")}, ` +
      `${plural(library.topics.length, "Thema", "Themen")}`,
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
      details.push(
        plural(backlinks.length, "Rückverweis", "Rückverweise"),
      );
    }
    const topics = library.topicsByItem.get(item.slug) ?? [];
    if (topics.length > 0) {
      details.push(`Themen: ${topics.map((c) => c.title).join(", ")}`);
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
        plural(topic.itemSlugs.length, "Teil", "Teile"),
    );
    line(`        ${topic.title}`);
    for (const slug of topic.itemSlugs) {
      const missing = topic.missingSlugs.includes(slug);
      line(`          ${missing ? "FEHLT  " : "       "}${slug}`);
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
