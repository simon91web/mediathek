/**
 * Mehrwort-Einträge aus tags nach synonyme schieben.
 * Ein Obsidian-Tag darf kein Leerzeichen enthalten.
 *
 *   node scripts/move-phrase-tags.mjs <vault>
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(import.meta.dirname, "..", "package.json"));
const YAML = require("yaml");

const vault = path.resolve(process.argv[2] ?? "");
if (!vault || !fs.existsSync(vault)) {
  console.error("Aufruf: node scripts/move-phrase-tags.mjs <vault>");
  process.exit(1);
}

function isObsidianTag(value) {
  return /^[\p{L}\p{N}_/-]+$/u.test(value) && /\p{L}/u.test(value);
}

function formatList(items) {
  if (items.length === 0) return "[]";
  return `[${items
    .map((entry) => YAML.stringify({ value: entry }).replace(/^value:\s*/, "").trim())
    .join(", ")}]`;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".obsidian" || entry.name === "anleitungen") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

let changed = 0;
for (const file of walk(vault)) {
  const raw = fs.readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) continue;
  const data = YAML.parse(match[1]) ?? {};
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : null;
  if (!tags) continue;
  const keep = [];
  const phrases = [];
  for (const tag of tags) {
    const text = tag.trim();
    if (!text) continue;
    if (isObsidianTag(text)) keep.push(text);
    else phrases.push(text);
  }
  if (phrases.length === 0) continue;
  const existing = Array.isArray(data.synonyme) ? data.synonyme.map(String) : [];
  const synonyme = [...existing];
  for (const phrase of phrases) {
    if (!synonyme.some((entry) => entry.toLowerCase() === phrase.toLowerCase())) synonyme.push(phrase);
  }
  const newline = raw.includes("\r\n") ? "\r\n" : "\n";
  const head = match[1]
    .replace(/^tags:.*$/m, `tags: ${formatList(keep)}`)
    .replace(/^synonyme:.*$/m, `synonyme: ${formatList(synonyme)}`);
  const withSynonyme = /^synonyme:/m.test(head)
    ? head
    : head.replace(/^tags:.*$/m, (line) => `${line}${newline}synonyme: ${formatList(synonyme)}`);
  const next = raw.replace(match[1], withSynonyme);
  fs.writeFileSync(file, next);
  changed += 1;
  console.log(path.relative(vault, file));
}
console.log(`${changed} Notizen`);
