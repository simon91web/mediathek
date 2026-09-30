/**
 * Harte Zeilenumbrüche in Absätzen zu einer Zeile zusammenziehen.
 * Überschriften, Listen, Einbettungen und Transkriptzeilen bleiben stehen.
 * Mehr als eine Leerzeile wird zu einer.
 *
 *   node scripts/tidy-prose.mjs <vault>
 */
import fs from "node:fs";
import path from "node:path";

const SKIP = new Set(["anleitungen", ".obsidian"]);

function keepLine(line) {
  const text = line.trim();
  return (
    /^#{1,6}\s/.test(text) ||
    /^[-*]\s/.test(text) ||
    /^\d+\.\s/.test(text) ||
    /^!\[\[/.test(text) ||
    /^\d{1,3}:\d{2}/.test(text)
  );
}

function unwrapBody(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let buf = [];

  const flush = () => {
    if (buf.length === 0) return;
    out.push(buf.join(" "));
    buf = [];
  };

  for (const line of lines) {
    const text = line.trim();
    if (text === "") {
      flush();
      out.push("");
      continue;
    }
    if (keepLine(text)) {
      flush();
      out.push(text);
      continue;
    }
    const previous = out.length > 0 ? out[out.length - 1] : "";
    if (buf.length === 0 && /^([-*]|\d+\.)\s/.test(previous)) {
      out[out.length - 1] = `${previous} ${text}`;
      continue;
    }
    buf.push(text);
  }
  flush();

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "\n")
    .replace(/\n+$/, "\n");
}

export function tidyMarkdown(text) {
  const match = /^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/.exec(text);
  if (!match) return text;
  const body = unwrapBody(text.slice(match[0].length));
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  return (match[1].replace(/\r\n/g, "\n") + body).replace(/\n/g, newline);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const vault = process.argv[2];
if (vault && process.argv[1].endsWith("tidy-prose.mjs")) {
  let changed = 0;
  for (const file of walk(path.resolve(vault))) {
    const raw = fs.readFileSync(file, "utf8");
    const next = tidyMarkdown(raw);
    if (next !== raw) {
      fs.writeFileSync(file, next);
      changed += 1;
      console.log(path.relative(vault, file));
    }
  }
  console.log(`${changed} Dateien`);
}
