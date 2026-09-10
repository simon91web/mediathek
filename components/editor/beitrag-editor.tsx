"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, Save } from "lucide-react";

import { saveItemAction } from "@/app/medien/[slug]/bearbeiten/actions";
import type { SaveResult } from "@/app/medien/[slug]/bearbeiten/actions";
import { MediaView } from "@/components/player/media-view";
import { PlayerProvider } from "@/components/player/player-provider";
import { usePlayerStore } from "@/components/player/player-store";
import { Button, ButtonLink } from "@/components/ui/basis";
import { insertChapterLine } from "@/lib/editor/chapter-line";
import { formatTimecode, parseChapterLines } from "@/lib/library/chapters";
import type { Chapter, MediaKind } from "@/lib/library/types";
import { cn } from "@/lib/utils";

/*
 * Der Editor arbeitet auf dem Rohtext von beitrag.md — bewusst kein
 * WYSIWYG.
 *
 * Zwei Gründe: eine Oberfläche, die Markdown "hübsch" bearbeitet, würde die
 * Marker-Blöcke zerstören, an denen Claude Code sich orientiert. Und der
 * Rohtext ist genau das Format, das Simon und Claude Code teilen — wer hier
 * etwas sieht, sieht dasselbe wie im Terminal.
 */

const DRAFT_PREFIX = "mediathek:entwurf:";

/** Nichts abonnieren: der Entwurf wird einmal beim Öffnen gelesen. */
const noopSubscribe = () => () => {};

export function BeitragEditor({
  slug,
  title,
  kind,
  initialContent,
  initialMtimeMs,
  mediaSrc,
  mediaMime,
  poster,
  chapters,
  durationSeconds,
}: {
  slug: string;
  title: string;
  kind: MediaKind;
  initialContent: string;
  initialMtimeMs: number | null;
  mediaSrc: string | null;
  mediaMime: string | null;
  poster: string | null;
  chapters: Chapter[];
  durationSeconds: number | null;
}) {
  const router = useRouter();
  const area = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState(initialContent);
  const [mtimeMs, setMtimeMs] = useState(initialMtimeMs);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    current: string;
    mtimeMs: number;
  } | null>(null);

  const dirty = content !== initialContent;
  const draftKey = `${DRAFT_PREFIX}${slug}`;

  /*
   * Ungesicherter Text überlebt einen versehentlich geschlossenen Tab.
   *
   * Der Entwurf wird ANGEBOTEN, nicht aufgezwungen: würde er den geladenen
   * Dateiinhalt automatisch überschreiben, wäre die Arbeit von Claude Code
   * still wieder weg. Und kein automatisches Speichern — in eine Datei, an
   * der auch Claude Code arbeitet, wird nur auf ausdrücklichen Wunsch
   * geschrieben.
   */
  const readDraft = useCallback(() => {
    try {
      return window.localStorage.getItem(draftKey);
    } catch {
      // Privates Fenster: dann eben ohne Entwurf.
      return null;
    }
  }, [draftKey]);
  const draft = useSyncExternalStore(noopSubscribe, readDraft, () => null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const draftAvailable =
    !draftDismissed && draft !== null && draft !== content && draft !== "";

  useEffect(() => {
    try {
      if (dirty) window.localStorage.setItem(draftKey, content);
      else window.localStorage.removeItem(draftKey);
    } catch {
      // Speicher voll oder gesperrt: verkraftbar.
    }
  }, [content, dirty, draftKey]);

  // Vor dem Verlassen warnen, solange etwas offen ist.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const save = useCallback(async () => {
    setSaving(true);
    setNote(null);
    const result: SaveResult = await saveItemAction(slug, content, mtimeMs);
    setSaving(false);

    if (result.ok) {
      setMtimeMs(result.mtimeMs);
      setConflict(null);
      setNote(result.message);
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Unwichtig.
      }
      router.refresh();
      return;
    }
    if (result.kind === "konflikt") {
      setConflict({ current: result.current, mtimeMs: result.mtimeMs });
      return;
    }
    setNote(result.error);
  }, [slug, content, mtimeMs, draftKey, router]);

  // Strg+S ist die Taste, die jeder ohnehin drückt.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  /** Der Knopf, der die manuelle Kapitelmarke erledigt. */
  const insertChapter = (seconds: number) => {
    const result = insertChapterLine(content, seconds, {
      forceHours: (durationSeconds ?? 0) >= 3600,
    });
    setContent(result.content);
    setNote(result.note);
    // Den Platzhaltertitel markieren, damit das erste Zeichen ihn ersetzt.
    requestAnimationFrame(() => {
      const element = area.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const chapterCount = parseChapterLines(content).length;

  return (
    <PlayerProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs tracking-wide text-schrift-3 uppercase">
              Bearbeiten
            </p>
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="mt-0.5 text-xs text-schrift-3">
              beitrag.md · {chapterCount}{" "}
              {kind === "text" ? "Kapitelzeilen" : "Kapitel"}
              {dirty ? " · nicht gespeichert" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/medien/${slug}`} size="klein">
              Ansehen
            </ButtonLink>
            <Button
              variant="primaer"
              size="klein"
              disabled={saving || !dirty}
              onClick={() => void save()}
            >
              <Save aria-hidden className="size-3.5" />
              {saving ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </div>

        {kind !== "text" && mediaSrc ? (
          <div className="space-y-2">
            <MediaView
              slug={slug}
              title={title}
              kind={kind}
              src={mediaSrc}
              mimeType={mediaMime}
              poster={poster}
              chapters={chapters}
              durationSeconds={durationSeconds}
              startAt={null}
            />
            <ChapterButton onInsert={insertChapter} />
          </div>
        ) : null}

        {conflict ? (
          <ConflictNotice
            conflict={conflict}
            onTakeOver={() => {
              setContent(conflict.current);
              setMtimeMs(conflict.mtimeMs);
              setConflict(null);
              setNote("Die fremde Fassung wurde übernommen.");
            }}
            onOverwrite={() => {
              setMtimeMs(conflict.mtimeMs);
              setConflict(null);
              setNote(
                "Der Zeitstempel wurde übernommen. Nochmals Speichern " +
                  "überschreibt die fremde Fassung.",
              );
            }}
          />
        ) : null}

        {draftAvailable && draft !== null ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rand bg-grund-2 px-3 py-2">
            <p className="min-w-0 flex-1 text-sm text-schrift-2">
              Von einer früheren Sitzung liegt ein nicht gespeicherter Entwurf
              vor.
            </p>
            <Button
              size="klein"
              onClick={() => {
                setContent(draft);
                setDraftDismissed(true);
                setNote("Der Entwurf wurde übernommen.");
              }}
            >
              Entwurf übernehmen
            </Button>
            <Button
              size="klein"
              variant="leise"
              onClick={() => {
                try {
                  window.localStorage.removeItem(draftKey);
                } catch {
                  // Unwichtig.
                }
                setDraftDismissed(true);
              }}
            >
              Verwerfen
            </Button>
          </div>
        ) : null}

        {note ? (
          <p role="status" className="text-sm text-akzent">
            {note}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label
              htmlFor="beitrag-md"
              className="mb-1.5 block text-xs tracking-wide text-schrift-3 uppercase"
            >
              Text
            </label>
            <textarea
              id="beitrag-md"
              ref={area}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              spellCheck={false}
              className="h-[60vh] w-full resize-y rounded-xl border border-rand bg-grund-2 p-3 font-mono text-[13px] leading-relaxed"
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs tracking-wide text-schrift-3 uppercase">
              Vorschau
            </p>
            <div className="h-[60vh] overflow-y-auto rounded-xl border border-rand bg-grund-2 p-3">
              <Preview content={content} />
            </div>
          </div>
        </div>

        <p className="text-xs text-schrift-2">
          Kapitel sind Zeilen wie{" "}
          <code className="rounded bg-grund-3 px-1">01:24 Akku prüfen</code>{" "}
          zwischen den Markern. Alles außerhalb der Marker bleibt unberührt —
          auch wenn Claude Code später Kapitel und Zusammenfassungen einträgt.
          Mit <kbd className="rounded bg-grund-3 px-1">Strg</kbd>+
          <kbd className="rounded bg-grund-3 px-1">S</kbd> speichern.{" "}
          <Link href={`/medien/${slug}`} className="text-akzent hover:underline">
            Zur Ansicht
          </Link>
        </p>
      </div>
    </PlayerProvider>
  );
}

/**
 * Der Knopf, der die manuelle Kapitelmarke erledigt. Steht innerhalb des
 * PlayerProviders, damit er den Store lesen kann.
 */
function ChapterButton({ onInsert }: { onInsert: (seconds: number) => void }) {
  const store = usePlayerStore();
  const [current, setCurrent] = useState<number | null>(null);

  /*
   * Der Store wird nur im Moment des Klicks gelesen, nicht abonniert: sonst
   * würde dieser Knopf viermal pro Sekunde neu rendern, obwohl die Zeit erst
   * beim Klick zählt.
   */
  const read = () => Math.floor(store?.getSnapshot().currentTime ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="klein"
        variant="primaer"
        onClick={() => {
          const seconds = read();
          setCurrent(seconds);
          onInsert(seconds);
        }}
      >
        <Clock aria-hidden className="size-3.5" />
        Aktuelle Zeit als Kapitel
      </Button>
      <span className="text-xs text-schrift-2">
        Fügt die Zeile an der richtigen Sortierstelle ein und markiert den
        Titel.
        {current !== null ? ` Zuletzt: ${formatTimecode(current)}.` : ""}
      </span>
    </div>
  );
}

/**
 * Eine schlichte Vorschau: sie zeigt Struktur, nicht Typografie. Für das
 * gerenderte Ergebnis gibt es die Ansicht — hier zählt, ob die Kapitel
 * erkannt werden.
 */
function Preview({ content }: { content: string }) {
  const chapters = parseChapterLines(content);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="mb-1 text-xs tracking-wide text-schrift-3 uppercase">
          Erkannte Kapitel ({chapters.length})
        </p>
        {chapters.length === 0 ? (
          <p className="text-xs text-schrift-2">
            Noch keine. Eine Zeile braucht Zeit UND Titel, damit sie als
            Kapitel gilt.
          </p>
        ) : (
          <ol className="space-y-0.5">
            {chapters.map((chapter, index) => (
              <li key={index} className="flex gap-2 text-xs">
                <span className="w-14 shrink-0 text-right tabular-nums text-schrift-3">
                  {chapter.raw.trim().split(/\s+/)[0]}
                </span>
                <span>{chapter.title}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-rand pt-3">
        <p className="mb-1 text-xs tracking-wide text-schrift-3 uppercase">
          Text
        </p>
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-schrift-2">
          {stripStructure(content) || "—"}
        </pre>
      </div>
    </div>
  );
}

/** Frontmatter und Marker für die Vorschau ausblenden. */
function stripStructure(content: string): string {
  return content
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ConflictNotice({
  conflict,
  onTakeOver,
  onOverwrite,
}: {
  conflict: { current: string; mtimeMs: number };
  onTakeOver: () => void;
  onOverwrite: () => void;
}) {
  const [showing, setShowing] = useState(false);

  return (
    <div className="space-y-3 rounded-xl border border-warnung/40 bg-warnung-grund p-4">
      <p className="flex items-start gap-2 text-sm text-warnung">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="font-medium">
            Die Datei wurde außerhalb geändert
          </strong>{" "}
          — vermutlich hat Claude Code gerade Kapitel oder eine
          Zusammenfassung eingetragen. Es wurde nichts gespeichert, deine
          Änderungen sind noch da.
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="klein" onClick={onTakeOver}>
          Fremde Fassung übernehmen
        </Button>
        <Button size="klein" onClick={onOverwrite}>
          Meine Fassung behalten
        </Button>
        <Button size="klein" onClick={() => setShowing((value) => !value)}>
          {showing ? "Fremde Fassung ausblenden" : "Fremde Fassung ansehen"}
        </Button>
      </div>
      {showing ? (
        <pre
          className={cn(
            "max-h-64 overflow-auto rounded-lg border border-rand bg-grund p-3",
            "font-mono text-[12px] leading-relaxed whitespace-pre-wrap",
          )}
        >
          {conflict.current}
        </pre>
      ) : null}
    </div>
  );
}
