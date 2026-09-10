import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { ITEM_FILES } from "@/lib/paths";
import type { Item } from "./types";

/*
 * Der aus Anhängen gezogene Text.
 *
 * Er liegt in anhaenge/.text/<datei>.txt — ein Punktordner, damit der
 * Bibliotheks-Scan ihn nicht für einen Anhang hält. Gelesen wird erst beim
 * Aufbau des Suchindex, nie beim Anzeigen eines Beitrags.
 */

export type AttachmentText = {
  /** Dateiname des Anhangs, nicht der Auszugsdatei. */
  file: string;
  label: string;
  text: string;
};

/** Wie viel Text je Anhang höchstens in den Index geht. */
const MAX_CHARS = 200_000;

export async function readAttachmentTexts(
  item: Item,
): Promise<AttachmentText[]> {
  if (!item.assets.attachmentsDir) return [];

  const textDir = path.join(
    item.assets.attachmentsDir,
    ITEM_FILES.attachmentText,
  );
  const found: AttachmentText[] = [];

  for (const attachment of item.attachments) {
    if (!attachment.hasText) continue;
    try {
      const raw = await fs.readFile(
        path.join(textDir, `${attachment.file}.txt`),
        "utf8",
      );
      const text = raw.trim();
      if (!text) continue;
      found.push({
        file: attachment.file,
        label: attachment.label,
        text: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text,
      });
    } catch {
      // Auszug fehlt oder ist unlesbar: dann eben ohne.
    }
  }

  return found;
}
