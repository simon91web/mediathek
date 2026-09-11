import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { paths } from "@/lib/paths";
import { assertSlug, slugify, uniqueSlug } from "./slug";
import type { Slug, Spot } from "./types";
import { formatWikilink } from "./wikilink";

/*
 * Sammlungen anlegen.
 *
 * Eigene Datei und nicht in ./write: dort geht es um Beitragsordner mit
 * Sperre je Slug, weil Editor, Import und Transkription an derselben
 * beitrag.md arbeiten können. Eine Sammlung ist eine einzelne Datei, die nur
 * hier entsteht — das braucht die Maschinerie nicht.
 *
 * Was hier NICHT passiert: Sammlungen werden nicht von einem Sprachmodell
 * erzeugt. Eine Sammlung ist die Aussage ihres Autors, in welcher
 * Reihenfolge er etwas zeigen würde; deshalb gibt es dafür keine Anleitung
 * in `anleitungen/` und keinen Marker-Block in der Datei.
 */

export type CreateCollectionOutcome =
  { ok: true; slug: Slug } | { ok: false; error: string };

export type NewCollection = {
  title: string;
  description?: string;
  /** Gesetzt heißt: gespeicherte Suche statt fester Liste. */
  query?: string | null;
  /** Die Ausschnitte, in dieser Reihenfolge. */
  entries?: ReadonlyArray<Pick<Spot, "slug" | "target" | "note">>;
  /**
   * Eine Sammlung ohne Ausschnitte und ohne Suche zulassen.
   *
   * Beim Anlegen von Hand ist genau das der Normalfall: erst entsteht die
   * Datei, dann kommen die Stellen hinein. Die Mediathek meldet sie so lange
   * als leer — das ist keine Panne, sondern die Erinnerung.
   */
  allowEmpty?: boolean;
};

/** Titel in YAML, nur zitiert, wenn nötig — von Hand gelesen bleibt lesbar. */
function yamlString(value: string): string {
  const needsQuotes =
    /^[\s>|&*!%@`'"[{]/.test(value) ||
    /:\s/.test(value) ||
    /\s$/.test(value) ||
    value === "";
  if (!needsQuotes) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Der Dateiinhalt. Getrennt, damit der Test ihn ohne Dateisystem prüfen kann. */
export function renderCollectionMarkdown(input: NewCollection): string {
  const head: string[] = ["---", `titel: ${yamlString(input.title.trim())}`];
  if (input.query?.trim()) {
    head.push(`suche: ${yamlString(input.query.trim())}`);
  }
  head.push("---", "");

  const body: string[] = [];
  if (input.description?.trim()) {
    body.push(input.description.trim(), "");
  } else if (input.query?.trim()) {
    body.push(
      "Eine gespeicherte Suche: sie läuft bei jedem Aufruf neu. Kommt ein",
      "Beitrag dazu, steht er von selbst mit drin.",
      "",
    );
  }

  for (const entry of input.entries ?? []) {
    const link = formatWikilink(entry.slug, entry.target);
    body.push(
      entry.note?.trim() ? `- ${link} ${entry.note.trim()}` : `- ${link}`,
    );
  }
  if ((input.entries?.length ?? 0) > 0) body.push("");

  return `${head.join("\n")}${body.join("\n")}`.replace(/\s*$/, "\n");
}

/** Welche Kennungen in sammlungen/ schon belegt sind — case-insensitiv. */
async function takenSlugs(): Promise<Set<string>> {
  try {
    const entries = await fs.readdir(paths.collections);
    return new Set(
      entries
        .filter((name) => /\.md$/i.test(name))
        .map((name) => path.parse(name).name.toLowerCase()),
    );
  } catch {
    // Kein sammlungen/-Ordner: dann ist auch nichts belegt.
    return new Set();
  }
}

/**
 * Legt `sammlungen/<slug>.md` an. Eine vorhandene Datei wird NIE
 * überschrieben — bei Namensgleichheit bekommt die neue eine Ziffer.
 */
export async function createCollection(
  input: NewCollection,
  slugWunsch?: string,
): Promise<CreateCollectionOutcome> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Ohne Titel geht es nicht." };
  }
  if (
    !input.allowEmpty &&
    !input.query?.trim() &&
    (input.entries?.length ?? 0) === 0
  ) {
    return {
      ok: false,
      error:
        "Eine Sammlung braucht entweder Ausschnitte oder eine gespeicherte " +
        "Suche — sonst ist sie leer.",
    };
  }

  const belegt = await takenSlugs();

  let slug: Slug;
  if (slugWunsch?.trim()) {
    try {
      slug = assertSlug(slugWunsch.trim().toLowerCase());
    } catch {
      return {
        ok: false,
        error:
          "Die Kennung ist nicht brauchbar. Erlaubt sind Kleinbuchstaben, " +
          "Ziffern und Bindestriche.",
      };
    }
    if (belegt.has(slug)) {
      return { ok: false, error: `Es gibt bereits eine Sammlung "${slug}".` };
    }
  } else {
    const gewuenscht = slugify(title);
    if (!gewuenscht) {
      return {
        ok: false,
        error:
          "Aus diesem Titel lässt sich keine Kennung bilden. Bitte einen " +
          "Titel mit Buchstaben oder Ziffern wählen.",
      };
    }
    slug = uniqueSlug(title, (candidate) => belegt.has(candidate));
  }

  const file = path.join(paths.collections, `${slug}.md`);
  const temporary = `${file}.tmp`;

  try {
    await fs.mkdir(paths.collections, { recursive: true });
    // Atomar wie überall: erst daneben schreiben, dann umbenennen.
    await fs.writeFile(temporary, renderCollectionMarkdown(input), "utf8");
    await fs.rename(temporary, file);
    return { ok: true, slug };
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    return {
      ok: false,
      error: `Die Sammlung konnte nicht angelegt werden: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
