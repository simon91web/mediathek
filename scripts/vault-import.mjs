/**
 * Einmalig: eine Mediathek im alten Ordnerformat in einen Obsidian-Vault
 * schreiben. Die Quelle wird nur gelesen.
 *
 *   node scripts/vault-import.mjs <quelle> <vault>
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { tidyMarkdown } from "./tidy-prose.mjs";

const require = createRequire(path.join(import.meta.dirname, "..", "package.json"));
const YAML = require("yaml");

const source = path.resolve(process.argv[2] ?? "");
const vault = path.resolve(process.argv[3] ?? "");
if (!source || !vault || !fs.existsSync(path.join(source, "medien"))) {
  console.error("Aufruf: node scripts/vault-import.mjs <quelle> <vault>");
  process.exit(1);
}

const template = path.join(import.meta.dirname, "..", "vorlagen", "vault");

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  return { data: YAML.parse(match[1]) ?? {}, body: match[2] ?? "" };
}

function block(body, name) {
  const re = new RegExp(
    `<!--\\s*${name}:start\\s*-->([\\s\\S]*?)<!--\\s*${name}:ende\\s*-->`,
    "i",
  );
  const match = body.match(re);
  return match ? match[1].trim() : "";
}

function withoutMarkers(body) {
  const names = [
    "kapitel",
    "zusammenfassung",
    "kapitelzusammenfassungen",
    "bezuege",
    "fundstellen",
    "antwort",
    "anhaenge",
  ];
  let text = body;
  for (const name of names) {
    text = text.replace(
      new RegExp(`<!--\\s*${name}:start\\s*-->[\\s\\S]*?<!--\\s*${name}:ende\\s*-->`, "gi"),
      "",
    );
  }
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitize(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, " - ")
    .replace(/\?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

function slugifyHeading(title) {
  return title
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseTimecode(raw) {
  const match = /^(?:(\d{1,2}):(\d{2})|(\d{1,3})):([0-5]\d)$/.exec(raw.trim());
  if (!match) return null;
  const seconds = Number(match[4]);
  if (match[3] !== undefined) return Number(match[3]) * 60 + seconds;
  const minutes = Number(match[2]);
  if (minutes > 59) return null;
  return Number(match[1]) * 3600 + minutes * 60 + seconds;
}

function formatTime(total) {
  const seconds = Math.max(0, Math.floor(total));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatDuration(total) {
  const seconds = Math.max(0, Math.round(total));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function yamlQuote(value) {
  return YAML.stringify({ value }).replace(/^value:\s*/, "").trim();
}

function listDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry) => entry.name);
}

function parseChapters(raw) {
  const chapters = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = /^(\d{1,3}:\d{2}(?::\d{2})?)\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const start = parseTimecode(match[1]);
    if (start === null) continue;
    chapters.push({
      time: match[1],
      title: match[2].trim(),
      start,
      heading: `${match[1]} ${match[2].trim()}`,
    });
  }
  return chapters;
}

function parseSummaries(raw) {
  const sections = [];
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const heading = /^###\s+(.+)$/.exec(line);
    if (heading) {
      current = { heading: heading[1].trim(), lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return sections.map((section) => ({
    heading: section.heading,
    body: section.lines.join("\n").trim(),
  }));
}

function summaryFor(chapter, summaries) {
  const byTime = summaries.find((section) => section.heading.startsWith(chapter.time));
  if (byTime) return byTime.body;
  const byTitle = summaries.find(
    (section) => section.heading === chapter.title || section.heading.endsWith(chapter.title),
  );
  return byTitle?.body ?? "";
}

function textHeadings(body) {
  const headings = [];
  for (const line of body.split(/\r?\n/)) {
    const match = /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    headings.push({ text: match[1].trim(), slug: slugifyHeading(match[1]) });
  }
  return headings;
}

const mediaSlugs = listDir(path.join(source, "medien")).filter((name) =>
  fs.existsSync(path.join(source, "medien", name, "beitrag.md")),
);
const topicSlugs = listDir(path.join(source, "themen"))
  .filter((name) => name.endsWith(".md"))
  .map((name) => name.slice(0, -3));
const glossarySlugs = listDir(path.join(source, "glossar"))
  .filter((name) => name.endsWith(".md"))
  .map((name) => name.slice(0, -3));
const questionSlugs = listDir(path.join(source, "fragen"))
  .filter((name) => name.endsWith(".md"))
  .map((name) => name.slice(0, -3));

const usedInFolder = new Map();
function readableAlias(fileBase) {
  const readable = fileBase
    .replace(/^\$\_/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!readable || readable === fileBase) return [];
  return [readable];
}

function isObsidianTag(value) {
  return /^[\p{L}\p{N}_/-]+$/u.test(value) && /\p{L}/u.test(value);
}

/** Ein Wort darf ein Tag sein. Mehrere Wörter gehören nach synonyme. */
function classifyTerms(values) {
  const tags = [];
  const synonyme = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value).trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (isObsidianTag(text)) tags.push(text);
    else synonyme.push(text);
  }
  return { tags, synonyme };
}

function uniqueBase(folder, preferred, slug) {
  const used = usedInFolder.get(folder) ?? new Set();
  usedInFolder.set(folder, used);
  let base = sanitize(preferred) || slug;
  if (!used.has(base.toLowerCase())) {
    used.add(base.toLowerCase());
    return base;
  }
  base = `${base} (${slug})`;
  used.add(base.toLowerCase());
  return base;
}

const byRole = {
  medium: new Map(),
  topic: new Map(),
  glossary: new Map(),
  question: new Map(),
};

const media = mediaSlugs.map((slug) => {
  const dir = path.join(source, "medien", slug);
  const parsed = splitFrontmatter(readText(path.join(dir, "beitrag.md")));
  const title = String(parsed.data.titel ?? slug);
  const fileBase = uniqueBase("10_Notizen", title, slug);
  const chapters = parseChapters(block(parsed.body, "kapitel"));
  const summaries = parseSummaries(block(parsed.body, "kapitelzusammenfassungen"));
  const prose = withoutMarkers(parsed.body);
  const proseKeep =
    prose === "Worum es in diesem Beitrag geht." || prose === "" ? "" : prose;
  const files = fs.readdirSync(dir);
  const video = files.find((name) => /^video\./i.test(name));
  const audio = files.find((name) => /^audio\./i.test(name));
  const mediaFile = video ?? audio ?? null;
  const kind = video ? "Video" : audio ? "Audio" : "Text";
  let duration = null;
  const transcriptPath = path.join(dir, "transcript.json");
  let segments = [];
  if (fs.existsSync(transcriptPath)) {
    const transcript = JSON.parse(readText(transcriptPath));
    if (typeof transcript.duration_sec === "number") duration = transcript.duration_sec;
    if (Array.isArray(transcript.segments)) segments = transcript.segments;
  }
  const item = {
    slug,
    role: "medium",
    title,
    fileBase,
    dir,
    kind,
    mediaFile,
    chapters,
    summaries,
    prose: proseKeep,
    summary: block(parsed.body, "zusammenfassung"),
    references: block(parsed.body, "bezuege"),
    headings: textHeadings(proseKeep),
    tags: Array.isArray(parsed.data.schlagworte) ? parsed.data.schlagworte : [],
    recorded: parsed.data.aufgenommen ? String(parsed.data.aufgenommen) : null,
    duration,
    segments,
  };
  byRole.medium.set(slug, item);
  return item;
});

for (const slug of topicSlugs) {
  const parsed = splitFrontmatter(readText(path.join(source, "themen", `${slug}.md`)));
  const title = String(parsed.data.titel ?? slug);
  const fileBase = uniqueBase("30_Themen", `$_${sanitize(title) || slug}`, slug);
  byRole.topic.set(slug, {
    slug,
    role: "topic",
    title,
    fileBase,
    prose: withoutMarkers(parsed.body),
    spots: block(parsed.body, "fundstellen"),
    synonyms: Array.isArray(parsed.data.synonyme) ? parsed.data.synonyme.map(String) : [],
    tags: Array.isArray(parsed.data.schlagworte) ? parsed.data.schlagworte : [],
  });
}

for (const slug of glossarySlugs) {
  const parsed = splitFrontmatter(readText(path.join(source, "glossar", `${slug}.md`)));
  const title = String(parsed.data.begriff ?? slug);
  const fileBase = uniqueBase("40_Glossar", title, slug);
  byRole.glossary.set(slug, {
    slug,
    role: "glossary",
    title,
    fileBase,
    prose: withoutMarkers(parsed.body),
    spots: block(parsed.body, "fundstellen"),
    aliases: Array.isArray(parsed.data.schreibweisen)
      ? parsed.data.schreibweisen.map(String)
      : [],
  });
}

for (const slug of questionSlugs) {
  const parsed = splitFrontmatter(readText(path.join(source, "fragen", `${slug}.md`)));
  const title = String(parsed.data.frage ?? slug).replace(/\?+$/g, "").trim();
  const fileBase = uniqueBase("50_Fragen", title, slug);
  byRole.question.set(slug, {
    slug,
    role: "question",
    title,
    fileBase,
    answer: block(parsed.body, "antwort") || withoutMarkers(parsed.body),
    asked: parsed.data.gefragt ? String(parsed.data.gefragt) : null,
  });
}

function chapterAt(item, seconds) {
  let chosen = null;
  for (const chapter of item.chapters ?? []) {
    if (chapter.start <= seconds) chosen = chapter;
    else break;
  }
  return chosen;
}

function resolveSlug(slug) {
  return (
    byRole.medium.get(slug) ??
    byRole.topic.get(slug) ??
    byRole.question.get(slug) ??
    byRole.glossary.get(slug) ??
    null
  );
}

function folderOf(item) {
  if (item.role === "medium") return "10_Notizen";
  if (item.role === "glossary") return "40_Glossar";
  if (item.role === "question") return "50_Fragen";
  if (item.role === "topic") return "30_Themen";
  return "";
}

function linkTarget(item) {
  const sameName = [];
  for (const group of Object.values(byRole)) {
    for (const other of group.values()) {
      if (other.fileBase.toLowerCase() === item.fileBase.toLowerCase()) sameName.push(other);
    }
  }
  if (sameName.length < 2) return item.fileBase;
  const folder = folderOf(item);
  return folder ? `${folder}/${item.fileBase}` : item.fileBase;
}

function rewriteLinks(text) {
  return text.replace(/\[\[([^\]|#]+)(#[^\]|]+)?(\|[^\]]+)?\]\]/g, (full, rawSlug, hash) => {
    const slug = String(rawSlug).trim();
    const item = resolveSlug(slug);
    if (!item) return full;
    const target = linkTarget(item);
    if (!hash) return `[[${target}]]`;
    const fragment = hash.slice(1).trim();
    const range = /^(\d{1,3}:\d{2}(?::\d{2})?)/.exec(fragment);
    if (range) {
      const seconds = parseTimecode(range[1]);
      const chapter = seconds === null ? null : chapterAt(item, seconds);
      if (chapter && chapter.start === seconds) return `[[${target}#${chapter.heading}]]`;
      if (chapter) return `[[${target}#${chapter.heading}|${range[1]}]]`;
      return `[[${target}]] (${range[1]})`;
    }
    const heading = (item.headings ?? []).find((entry) => entry.slug === slugifyHeading(fragment));
    if (heading) return `[[${target}#${heading.text}]]`;
    const byText = (item.headings ?? []).find((entry) => entry.text === fragment);
    if (byText) return `[[${target}#${byText.text}]]`;
    return `[[${target}]]`;
  });
}

function frontmatter(fields) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      lines.push(value.length === 0 ? `${key}: []` : `${key}: [${value.map((entry) => yamlQuote(String(entry))).join(", ")}]`);
      continue;
    }
    lines.push(`${key}: ${yamlQuote(String(value))}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(rel, content) {
  const file = path.join(vault, rel);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, tidyMarkdown(content).replace(/\n/g, "\r\n"), "utf8");
}

function copyTemplateFile(rel, overwrite = false) {
  const from = path.join(template, rel);
  const to = path.join(vault, rel);
  if (!overwrite && fs.existsSync(to)) return;
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

const sichten = path.join(template, "80_Sichten");
if (fs.existsSync(sichten)) {
  for (const name of fs.readdirSync(sichten)) {
    copyTemplateFile(path.join("80_Sichten", name));
  }
}
ensureDir(path.join(vault, "00_Inbox"));
ensureDir(path.join(vault, "Sammlungen"));
ensureDir(path.join(vault, "70_Analysen"));

let copiedBytes = 0;

for (const item of media) {
  const chapters = item.chapters
    .map((chapter) => {
      const summary = rewriteLinks(summaryFor(chapter, item.summaries));
      return summary
        ? `### ${chapter.heading}\n\n${summary}`
        : `### ${chapter.heading}`;
    })
    .join("\n\n");
  const transcript = item.segments
    .map((segment) => {
      const text = String(segment.text ?? "").trim();
      if (!text) return "";
      return `${formatTime(Number(segment.start) || 0)} ${text}`;
    })
    .filter(Boolean)
    .join("\n");
  const status =
    item.chapters.length > 0 || (item.kind === "Text" && item.prose)
      ? "erschlossen"
      : item.segments.length > 0
        ? "transkribiert"
        : "gesichtet";
  const parts = [
    frontmatter({
      typ: "Medium",
      art: item.kind,
      tags: item.tags,
      aufgenommen: item.recorded,
      dauer: item.duration === null ? null : formatDuration(item.duration),
      aliases: readableAlias(item.fileBase),
      status,
    }),
  ];
  if (item.prose) parts.push(rewriteLinks(item.prose), "");
  if (item.mediaFile) {
    const ext = path.extname(item.mediaFile);
    parts.push(`![[${item.fileBase}${ext}]]`, "");
  }
  if (item.kind !== "Text") {
    parts.push("## Kapitel", "", chapters, "");
  }
  if (item.summary) parts.push("## Zusammenfassung", "", rewriteLinks(item.summary), "");
  if (item.references) parts.push("## Bezüge", "", rewriteLinks(item.references), "");
  if (transcript) parts.push("## Transkript", "", transcript, "");
  writeFile(path.join("10_Notizen", `${item.fileBase}.md`), `${parts.join("\n").trim()}\n`);

  const destDir = path.join(vault, "10_Notizen");
  const attachDir = path.join(vault, "20_Attachments");
  ensureDir(attachDir);
  if (item.mediaFile) {
    const ext = path.extname(item.mediaFile);
    const from = path.join(item.dir, item.mediaFile);
    const to = path.join(attachDir, `${item.fileBase}${ext}`);
    if (!fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(from).size) {
      fs.copyFileSync(from, to);
      copiedBytes += fs.statSync(from).size;
    }
  }
  const transcriptFrom = path.join(item.dir, "transcript.json");
  if (fs.existsSync(transcriptFrom)) {
    fs.copyFileSync(transcriptFrom, path.join(destDir, `${item.fileBase}.transcript.json`));
  }
}

for (const slug of topicSlugs) {
  const item = byRole.topic.get(slug);
  const noteSlugs = [];
  const spotText = rewriteLinks(item.spots);
  for (const match of item.spots.matchAll(/\[\[([^\]|#]+)/g)) {
    const target = resolveSlug(match[1].trim());
    if (target?.role === "medium" && !noteSlugs.includes(target.fileBase)) {
      noteSlugs.push(target.fileBase);
    }
  }
  const notes = noteSlugs.map((name) => `- [[${name}]]`).join("\n");
  const terms = classifyTerms([...item.tags, ...item.synonyms]);
  const body = [
    frontmatter({
      typ: "Thema",
      tags: terms.tags,
      synonyme: terms.synonyme.length > 0 ? terms.synonyme : null,
      aliases: readableAlias(item.fileBase),
      status: "erschlossen",
    }),
    rewriteLinks(item.prose),
    "",
    "## Notizen",
    "",
    notes,
    "",
    "## Fundstellen",
    "",
    spotText,
    "",
  ].join("\n");
  writeFile(path.join("30_Themen", `${item.fileBase}.md`), body);
}

ensureDir(path.join(vault, "40_Glossar"));
for (const slug of glossarySlugs) {
  const item = byRole.glossary.get(slug);
  const terms = classifyTerms(item.aliases);
  const body = [
    frontmatter({
      typ: "Begriff",
      begriff: item.title,
      tags: terms.tags,
      synonyme: terms.synonyme.length > 0 ? terms.synonyme : null,
      aliases: readableAlias(item.fileBase),
      status: "erschlossen",
    }),
    rewriteLinks(item.prose),
    "",
    "## Fundstellen",
    "",
    rewriteLinks(item.spots),
    "",
  ].join("\n");
  writeFile(path.join("40_Glossar", `${item.fileBase}.md`), body);
}

ensureDir(path.join(vault, "50_Fragen"));
for (const slug of questionSlugs) {
  const item = byRole.question.get(slug);
  const body = [
    frontmatter({
      typ: "Frage",
      gefragt: item.asked,
      aliases: readableAlias(item.fileBase),
      status: "erschlossen",
    }),
    "## Antwort",
    "",
    rewriteLinks(item.answer),
    "",
  ].join("\n");
  writeFile(path.join("50_Fragen", `${item.fileBase}.md`), body);
}

const analysisPath = path.join(source, "analysen", "vollstaendigkeit.md");
if (fs.existsSync(analysisPath)) {
  const raw = readText(analysisPath).trim();
  writeFile(
    path.join("70_Analysen", "Vollständigkeit.md"),
    `${frontmatter({ typ: "Analyse", status: "erschlossen" })}${rewriteLinks(raw)}\n`,
  );
}

const mb = (copiedBytes / (1024 * 1024)).toFixed(0);
console.log(`Medien: ${media.length}`);
console.log(`Karten: ${topicSlugs.length}`);
console.log(`Glossar: ${glossarySlugs.length}`);
console.log(`Fragen: ${questionSlugs.length}`);
console.log(`Kopierte Medien: ${mb} MB`);
for (const group of Object.values(byRole)) {
  for (const item of group.values()) {
    console.log(`${item.role} | ${item.slug} | ${item.fileBase}`);
  }
}
