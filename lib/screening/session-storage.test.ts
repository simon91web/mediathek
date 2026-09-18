import { describe, expect, it } from "vitest";

import { parseSession, readSessionRaw, writeSession } from "./session-storage";
import type { ScreeningCandidate } from "./types";

/*
 * Ohne Browser getestet, wie bei watch-progress.ts: der Speicher wird
 * übergeben statt aus window.localStorage gelesen.
 */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

const kandidat: ScreeningCandidate = {
  sourcePath: "C:\\Captures\\clip.mp4",
  hash: "abc123",
  fileName: "clip.mp4",
  kind: "video",
  titleGuess: "Clip",
  slugGuess: "clip",
  slugTaken: false,
  recorded: null,
  durationSec: 42,
  sizeBytes: 1000,
  state: "wartet",
  jobId: null,
  progress: 0,
  stageMessage: null,
  deviceUsed: null,
  speed: null,
  verdict: null,
  summary: null,
  matches: [],
  error: null,
};

describe("Sichtung-Sitzung im Browser", () => {
  it("liefert null, solange nichts geschrieben ist", () => {
    const storage = fakeStorage();
    expect(readSessionRaw(storage)).toBeNull();
    expect(parseSession(readSessionRaw(storage))).toBeNull();
  });

  it("übersteht einen Schreib-Lese-Zyklus unverändert", () => {
    const storage = fakeStorage();
    writeSession(
      { pfad: "C:\\Captures", candidates: [kandidat], selected: ["C:\\Captures\\clip.mp4"] },
      storage,
    );
    const session = parseSession(readSessionRaw(storage));
    expect(session).toMatchObject({ pfad: "C:\\Captures", selected: ["C:\\Captures\\clip.mp4"] });
    expect(session?.candidates).toHaveLength(1);
  });

  it("löscht den Eintrag, wenn null geschrieben wird", () => {
    const storage = fakeStorage();
    writeSession({ pfad: "x", candidates: [kandidat], selected: [] }, storage);
    writeSession(null, storage);
    expect(readSessionRaw(storage)).toBeNull();
  });

  it("verwirft kaputtes JSON, statt zu werfen", () => {
    const storage = fakeStorage();
    storage.setItem("mediathek:sichtung:sitzung:v1", "{ kaputt");
    expect(parseSession(readSessionRaw(storage))).toBeNull();
  });

  it("verwirft ein Objekt ohne candidates-Feld", () => {
    const storage = fakeStorage();
    storage.setItem("mediathek:sichtung:sitzung:v1", JSON.stringify({ pfad: "x" }));
    expect(parseSession(readSessionRaw(storage))).toBeNull();
  });
});
