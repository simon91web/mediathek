/**
 * Reine Auftragslogik für scripts/vault.mjs. Kein Prozess, kein Dateisystem.
 * Die Anleitung geht als Text in den Auftrag, weil das Werkzeug im Vault
 * arbeitet und die Dateien unter vorlagen/anleitungen/ liegen.
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(import.meta.dirname, "..", "package.json"));
const YAML = require("yaml");

export const MODEL_TASKS = [
  "inbox",
  "sichtung",
  "kapitel",
  "kapitel-alle",
  "bezuege",
  "themen",
  "glossar",
  "fragen",
  "vollstaendigkeit",
  "bestand",
];

export const TASKS = [...MODEL_TASKS, "transkribieren", "wortlaut"];

const WITH_NOTE = new Set(["kapitel", "bezuege", "transkribieren"]);
const WITH_FILE = new Set(["sichtung"]);

/** Steht vor der eigenen Anleitung, weil die Aufgabe ihn zuerst lesen soll. */
const BEFORE = { inbox: ["sichtung"] };

/** Steht hinter der eigenen Anleitung. */
const AFTER = { "kapitel-alle": ["kapitel"] };

export const TASK_LABEL = {
  inbox: "Inbox einarbeiten",
  sichtung: "Eine Datei beurteilen",
  kapitel: "Diese Notiz erschließen",
  "kapitel-alle": "Notizen ohne Kapitel erschließen",
  bezuege: "Bezüge für diese Notiz",
  themen: "Maps of Content pflegen",
  glossar: "Glossar sammeln",
  fragen: "Fragen zusammenfassen",
  vollstaendigkeit: "Lücken analysieren",
  bestand: "Bestand fragen",
  transkribieren: "Diese Notiz transkribieren",
  wortlaut: "Hörfehler gegen das Glossar prüfen",
};

export function readToolset(text) {
  const data = YAML.parse(text);
  const version = data && typeof data === "object" ? data.version : null;
  if (version !== 1) {
    throw new Error(
      version === null || version === undefined
        ? "toolset.yaml hat keine version."
        : `toolset.yaml hat version ${version}. Dieses Kommando kennt version 1.`,
    );
  }
  const ordner = data.ordner ?? {};
  for (const key of ["notizen", "anhaenge", "karten", "glossar", "fragen"]) {
    if (typeof ordner[key] !== "string" || !ordner[key]) {
      throw new Error(`toolset.yaml: ordner.${key} fehlt.`);
    }
  }
  if (typeof data.inbox !== "string" || !data.inbox) {
    throw new Error("toolset.yaml: inbox fehlt.");
  }
  return {
    version: 1,
    inbox: data.inbox,
    ordner: {
      notizen: ordner.notizen,
      anhaenge: ordner.anhaenge,
      karten: ordner.karten,
      glossar: ordner.glossar,
      fragen: ordner.fragen,
      sammlungen: typeof ordner.sammlungen === "string" ? ordner.sammlungen : "60_Sammlungen",
      analysen: typeof ordner.analysen === "string" ? ordner.analysen : "70_Analysen",
      sichten: typeof ordner.sichten === "string" ? ordner.sichten : "80_Sichten",
    },
  };
}

export function assertPlainName(name) {
  if (!name || /[\\/\0]/.test(name) || name === "." || name === "..") {
    throw new Error("Der Name darf kein Verzeichnis sein.");
  }
}

export function noteRelatives(folders, task, name) {
  assertPlainName(name);
  if (task === "sichtung") {
    const fileName = name.includes(".") ? name : `${name}.md`;
    return [`${folders.inbox}/${fileName}`];
  }
  const base = name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
  return [`${folders.ordner.notizen}/${base}.md`];
}

function section(id, texts) {
  const text = texts[id];
  if (!text || !text.trim()) throw new Error(`Anleitung %_${id}.md fehlt.`);
  return `# %_${id}.md\n\n${text.trim()}`;
}

/**
 * Regeln, mitgeltende Anleitungen und der Fokus. Die Frage steht am Ende,
 * weil %_bestand.md sie dort erwartet.
 */
export function buildOrder({ task, note, question, regeln, texts }) {
  if (!MODEL_TASKS.includes(task)) throw new Error(`Unbekannte Aufgabe ${task}.`);
  if (!regeln || !regeln.trim()) throw new Error("Die Regeln fehlen.");
  const regelnBody = regeln.trim().replace(/^# Regeln\r?\n+/, "");
  const parts = [regelnBody];
  for (const id of BEFORE[task] ?? []) parts.push(section(id, texts));
  parts.push(section(task, texts));
  for (const id of AFTER[task] ?? []) parts.push(section(id, texts));

  let focus = "";
  if (task === "bestand") {
    if (!question || !question.trim()) throw new Error("Die Frage ist leer.");
    focus = `Frage:\n${question.trim()}\n`;
  } else if (WITH_FILE.has(task)) {
    if (!note) throw new Error("Keine Datei genannt.");
    focus = `Es geht um die Datei ${note}.\n`;
  } else if (WITH_NOTE.has(task)) {
    if (!note) throw new Error("Keine Notiz genannt.");
    focus = `Es geht um die Notiz ${note}.\n`;
  }

  const head = [
    "Arbeitsordner ist der Vault. Die Anleitungen dieses Auftrags stehen vollständig in diesem Text.",
    "Ein Verweis wie `%_kapitel.md` meint den gleichnamigen Abschnitt hier. Geschrieben wird nur im Vault.",
    "",
    "# Regeln",
    "",
  ].join("\n");
  return `${head}\n${parts.join("\n\n")}\n\n${focus}`.replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");
}

export function focusFrom(task, rest) {
  if (task === "bestand") return { note: null, question: rest.join(" ").trim() };
  if (WITH_NOTE.has(task) || WITH_FILE.has(task)) {
    if (rest.length !== 1) throw new Error("Genau ein Name, in Anführungszeichen wenn er Leerzeichen enthält.");
    assertPlainName(rest[0]);
    const note =
      WITH_NOTE.has(task) && rest[0].toLowerCase().endsWith(".md") ? rest[0].slice(0, -3) : rest[0];
    return { note, question: null };
  }
  if (rest.length > 0) throw new Error(`${TASK_LABEL[task]} nimmt keinen Namen.`);
  return { note: null, question: null };
}

export function parseVaultArgs(argv) {
  const out = {
    vault: "",
    werkzeug: "grok",
    bin: "",
    extraArgs: "",
    timeoutSec: 900,
    dryRun: false,
    anwenden: false,
    help: false,
    task: "",
    rest: [],
  };
  const args = [...argv];
  const positionals = [];
  while (args.length > 0) {
    const token = args.shift();
    if (token === "--vault") out.vault = args.shift() ?? "";
    else if (token === "--werkzeug") out.werkzeug = args.shift() ?? "";
    else if (token === "--bin") out.bin = args.shift() ?? "";
    else if (token === "--args") out.extraArgs = args.shift() ?? "";
    else if (token === "--timeout") out.timeoutSec = Number(args.shift());
    else if (token === "--was") out.dryRun = true;
    else if (token === "--anwenden") out.anwenden = true;
    else if (token === "--hilfe" || token === "-h" || token === "--help") out.help = true;
    else if (token.startsWith("-")) throw new Error(`Unbekannte Option ${token}.`);
    else positionals.push(token);
  }
  out.task = positionals[0] ?? "";
  out.rest = positionals.slice(1);
  return out;
}

export function assertInvocation(parsed) {
  if (!parsed.vault.trim()) throw new Error("Aufruf: node scripts/vault.mjs --vault <ordner> <aufgabe> …");
  if (!["grok", "claude", "custom"].includes(parsed.werkzeug)) {
    throw new Error("Werkzeug ist grok, claude oder custom.");
  }
  if (parsed.werkzeug === "custom" && !parsed.bin.trim()) {
    throw new Error("Für ein eigenes Programm muss --bin gesetzt sein.");
  }
  if (!TASKS.includes(parsed.task)) {
    throw new Error(parsed.task ? `Unbekannte Aufgabe ${parsed.task}.` : "Die Aufgabe fehlt.");
  }
  if (!Number.isFinite(parsed.timeoutSec) || parsed.timeoutSec < 30) {
    throw new Error("Das Zeitlimit ist eine Zahl ab 30 Sekunden.");
  }
}

export function splitArgs(value) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match;
  while ((match = re.exec(value))) out.push(match[1] ?? match[2] ?? match[0]);
  return out;
}

export function assertBinary(value) {
  if (!value.trim()) throw new Error("Kein Werkzeug eingestellt.");
  if (/[\r\n\0]/.test(value)) throw new Error("Ungültiger Werkzeugpfad.");
}

/** Argumente ohne Shell. Der Auftrag steht in einer Datei oder, bei Claude, auf stdin. */
export function buildCliArgs(settings, promptFile) {
  const extra = splitArgs(settings.cliExtraArgs);
  if (settings.cliPreset === "custom") return extra.length > 0 ? extra : ["--prompt-file", promptFile];
  if (settings.cliPreset === "claude") return ["-p", "--permission-mode", "acceptEdits", ...extra];
  return ["--prompt-file", promptFile, "--permission-mode", "acceptEdits", "--disable-web-search", ...extra];
}

export function sendsPromptOnStdin(preset) {
  return preset === "claude";
}

export function knownBinary(preset, home) {
  const exe = process.platform === "win32" ? ".exe" : "";
  if (preset === "grok") return [path.join(home, ".grok", "bin", `grok${exe}`)];
  if (preset === "claude") return [path.join(home, ".local", "bin", `claude${exe}`)];
  return [];
}

const MEDIA_EXT = ["mp4", "m4v", "mov", "mkv", "webm", "mp3", "m4a", "wav", "ogg"];

export function mediaBeside(basename, names) {
  const lower = new Map(names.map((name) => [name.toLowerCase(), name]));
  for (const ext of MEDIA_EXT) {
    const found = lower.get(`${basename}.${ext}`.toLowerCase());
    if (found) return found;
  }
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsonStringEscape(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

/**
 * `hoerfehler` sind falsch gehörte oder falsch geschriebene Formen von `begriff`.
 * Sie werden nicht zu Hotwords. `synonyme` bleiben echte andere Namen.
 */
export function hearingRules(texts) {
  const rules = [];
  for (const text of texts) {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!frontmatter) continue;
    let data;
    try {
      data = YAML.parse(frontmatter[1]);
    } catch {
      continue;
    }
    const begriff = typeof data?.begriff === "string" ? data.begriff.trim() : "";
    const heard = Array.isArray(data?.hoerfehler) ? data.hoerfehler : [];
    if (!begriff) continue;
    for (const entry of heard) {
      const wrong = typeof entry === "string" ? entry.trim() : "";
      if (!wrong || wrong === begriff) continue;
      rules.push({ wrong, begriff });
    }
  }
  rules.sort((a, b) => b.wrong.length - a.wrong.length || a.wrong.localeCompare(b.wrong, "de"));
  return rules;
}

/**
 * Ersetzt Hörfehler im Text. Die schon richtige Schreibweise bleibt stehen.
 * `json` maskiert die neue Form, weil transcript.json als Text ersetzt wird
 * und die Einrückung nicht neu geschrieben werden soll.
 */
export function replaceHearings(text, rules, options = {}) {
  const found = [];
  for (const rule of rules) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(rule.wrong)}(?![\\p{L}\\p{N}])`,
      "giu",
    );
    for (const match of text.matchAll(pattern)) {
      if (match[0] === rule.begriff || match.index === undefined) continue;
      found.push({
        start: match.index,
        end: match.index + match[0].length,
        wrong: match[0],
        begriff: rule.begriff,
      });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let cursor = -1;
  for (const match of found) {
    if (match.start < cursor) continue;
    kept.push(match);
    cursor = match.end;
  }
  const hits = kept.map((match) => {
    const from = Math.max(0, match.start - 42);
    const to = Math.min(text.length, match.end + 42);
    return {
      wrong: match.wrong,
      begriff: match.begriff,
      snippet: text.slice(from, to).replace(/\s+/g, " ").trim(),
    };
  });
  let next = text;
  for (const match of [...kept].reverse()) {
    const replacement = options.json ? jsonStringEscape(match.begriff) : match.begriff;
    next = next.slice(0, match.start) + replacement + next.slice(match.end);
  }
  return { text: next, hits };
}

/** Frontmatter bleibt, damit die Liste der Hörfehler nicht sich selbst ersetzt. */
export function replaceHearingsInNote(text, rules) {
  const frontmatter = /^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/.exec(text);
  if (!frontmatter) return replaceHearings(text, rules);
  const body = replaceHearings(text.slice(frontmatter[1].length), rules);
  return { text: frontmatter[1] + body.text, hits: body.hits };
}

export function glossaryTerms(texts) {
  const terms = [];
  const seen = new Set();
  for (const text of texts) {
    const match = /^begriff:\s*(.+)\s*$/m.exec(text);
    const term = match?.[1]?.replace(/^["']|["']$/g, "").trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

export function formatTranscript(segments) {
  return segments
    .map((segment) => {
      const text = segment.text.trim();
      if (!text) return "";
      const seconds = Math.max(0, Math.floor(segment.start));
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      const pad = (value) => String(value).padStart(2, "0");
      const stamp = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
      return `${stamp} ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function upsertTranscript(markdown, body) {
  const block = `## Transkript\n\n${body}\n`;
  const pattern = /^## Transkript\r?\n[\s\S]*?(?=^## |\s*$)/m;
  if (pattern.test(markdown)) return markdown.replace(pattern, block);
  return `${markdown.replace(/\s*$/, "")}\n\n${block}`;
}

export function structuralHinweis(file) {
  if (file.art === "Karte") return file.hasSpots ? "" : "Fundstellen fehlen";
  if (file.art === "Text" || file.art === "Inbox") return "";
  const missingTranscript = !file.hasTranscript;
  const missingChapters = !file.hasChapters;
  if (missingTranscript && missingChapters) return "Transkript und Kapitel fehlen";
  if (missingTranscript) return "Transkript fehlt";
  if (missingChapters) return "Kapitel fehlen";
  return "";
}

export function artOf(text) {
  const artMatch = /^art:\s*(Video|Audio|Text)\s*$/m.exec(text);
  const art = artMatch?.[1] ?? "Video";
  return art === "Audio" || art === "Text" ? art : "Video";
}

export function spotsPresent(text) {
  const spots = /## Fundstellen\s*\n+([\s\S]*?)(?=\n## |\s*$)/.exec(text)?.[1]?.trim() ?? "";
  return spots.length > 0;
}

/**
 * status und hinweis nach dem strukturellen Stand. null heißt: die Datei
 * bleibt, auch ein schon gesetzter Hinweis.
 */
export function applyStatus(markdown, status, hinweis) {
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const text = markdown.replace(/\r\n/g, "\n");
  const match = /^(---\n)([\s\S]*?)(\n---\n?)/.exec(text);
  if (!match?.[2]) {
    if (!hinweis) return markdown;
    const added = `---\nstatus: ${status}\nhinweis: ${hinweis}\n---\n\n${text}`;
    return added.replace(/\n/g, newline);
  }
  let yaml = match[2];
  if (/^status:/m.test(yaml)) yaml = yaml.replace(/^status:.*$/m, `status: ${status}`);
  else yaml = `${yaml}\nstatus: ${status}`;
  if (hinweis === "") yaml = yaml.replace(/\nhinweis:.*$/m, "");
  else if (hinweis) {
    if (/^hinweis:/m.test(yaml)) yaml = yaml.replace(/^hinweis:.*$/m, `hinweis: ${hinweis}`);
    else yaml = yaml.replace(/^status:.*$/m, (line) => `${line}\nhinweis: ${hinweis}`);
  }
  const body = text.slice(match[0].length);
  return `---\n${yaml.replace(/^\n/, "")}\n---\n${body}`.replace(/\n/g, newline);
}

export function nextStatus(markdown, file) {
  const hinweis = structuralHinweis(file);
  const hasHinweis = /^hinweis:/m.test(markdown);
  if (!hinweis && hasHinweis) return null;
  const next = applyStatus(markdown, hinweis ? "offen" : "erschlossen", hinweis ? hinweis : "");
  return next === markdown ? null : next;
}
