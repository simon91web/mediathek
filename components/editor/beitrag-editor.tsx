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
import {
  AlertTriangle,
  BookOpen,
  Check,
  Clock,
  Pencil,
  PenLine,
  Save,
  X,
} from "lucide-react";

import { saveItemAction } from "@/app/medien/[slug]/bearbeiten/actions";
import type { SaveResult } from "@/app/medien/[slug]/bearbeiten/actions";
import type {
  LivePreviewEditorHandle,
  LivePreviewMode,
} from "@/components/editor/live-preview-editor";
import { LivePreviewEditor } from "@/components/editor/live-preview-editor";
import { MediaView } from "@/components/player/media-view";
import { PlayerProvider } from "@/components/player/player-provider";
import { usePlayerStore } from "@/components/player/player-store";
import { Button, ButtonLink } from "@/components/ui/basis";
import { insertChapterLine } from "@/lib/editor/chapter-line";
import { setTitleLine } from "@/lib/editor/title-line";
import { formatTimecode, parseChapterLines } from "@/lib/library/chapters";
import type { Chapter, MediaKind } from "@/lib/library/types";
import { cn } from "@/lib/utils";

/*
 * Der Editor arbeitet auf dem Rohtext von beitrag.md — bewusst kein
 * WYSIWYG, auch wenn er wie einer aussieht.
 *
 * Geschrieben wird im Lesemodus (wie Obsidians Live-Preview): Überschriften,
 * Fett/Kursiv, Wikilinks und Marker-Blöcke werden nur solange dekoriert, wie
 * der Cursor nicht in ihrer Zeile steht — components/editor/live-preview-
 * editor.tsx zeichnet das über echtem Markdown-Text, ändert ihn aber nie.
 * Das bleibt aus zwei Gründen wichtig: Claude Code orientiert sich an den
 * Marker-Blöcken, und der Rohtext ist genau das Format, das Simon und Claude
 * Code teilen — was hier gespeichert wird, ist dasselbe, was im Terminal
 * steht.
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
  initialMode = "lesen",
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
  /** "schreiben" für einen frisch angelegten Beitrag — da gibt es noch nichts zu lesen. */
  initialMode?: LivePreviewMode;
}) {
  const router = useRouter();
  const editor = useRef<LivePreviewEditorHandle>(null);
  const [content, setContent] = useState(initialContent);
  const [mode, setMode] = useState<LivePreviewMode>(initialMode);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const titleInput = useRef<HTMLInputElement>(null);
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

  /*
   * `overrideContent` ist für den Titel-Stift: der ruft speichern direkt
   * nach dem Bestätigen auf, und `content` wäre zu diesem Zeitpunkt noch der
   * alte Stand aus dem Render-Zeitpunkt (React-State ist nicht synchron).
   */
  const save = useCallback(
    async (overrideContent?: string) => {
      const body = overrideContent ?? content;
      if (overrideContent !== undefined) setContent(overrideContent);
      setSaving(true);
      setNote(null);
      const result: SaveResult = await saveItemAction(slug, body, mtimeMs);
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
    },
    [slug, content, mtimeMs, draftKey, router],
  );

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
    // Wer eine Kapitelmarke setzt, will den Platzhaltertitel auch bearbeiten.
    setMode("schreiben");
    // Den Platzhaltertitel markieren, damit das erste Zeichen ihn ersetzt.
    requestAnimationFrame(() => {
      editor.current?.setSelection(result.selectionStart, result.selectionEnd);
    });
  };

  const startTitleEdit = () => {
    setTitleDraft(title);
    setTitleEditing(true);
  };

  const cancelTitleEdit = () => {
    setTitleDraft(title);
    setTitleEditing(false);
  };

  /*
   * Der Titel lebt in derselben Datei wie der Rest — es gibt kein separates
   * "nur den Titel speichern". Bestätigt wird deshalb sofort gespeichert,
   * nicht bloß im Entwurf vorgemerkt: das Häkchen verspricht "fertig", nicht
   * "auf den großen Speichern-Knopf warten".
   */
  const confirmTitleEdit = () => {
    const next = titleDraft.trim();
    setTitleEditing(false);
    if (!next || next === title) return;
    const result = setTitleLine(content, next);
    if (!result.ok) {
      setNote(result.reason);
      return;
    }
    void save(result.content);
  };

  useEffect(() => {
    if (titleEditing) {
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [titleEditing]);

  const chapterCount = parseChapterLines(content).length;

  return (
    <PlayerProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs tracking-wide text-schrift-3 uppercase">
              Bearbeiten
            </p>
            {titleEditing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={titleInput}
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      confirmTitleEdit();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelTitleEdit();
                    }
                  }}
                  aria-label="Titel"
                  className="min-w-0 grow border-b border-akzent bg-transparent text-xl font-semibold tracking-tight outline-none"
                />
                <button
                  type="button"
                  onClick={confirmTitleEdit}
                  aria-label="Titel übernehmen"
                  title="Übernehmen"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-akzent hover:bg-grund-3"
                >
                  <Check aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={cancelTitleEdit}
                  aria-label="Umbenennen abbrechen"
                  title="Abbrechen"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-schrift-3 hover:bg-grund-3 hover:text-schrift"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <h1 className="truncate text-xl font-semibold tracking-tight">
                  {title}
                </h1>
                <button
                  type="button"
                  onClick={startTitleEdit}
                  aria-label="Titel bearbeiten"
                  title="Titel bearbeiten"
                  className="flex size-[22px] shrink-0 items-center justify-center rounded-md text-schrift-3 hover:bg-grund-3 hover:text-schrift"
                >
                  <Pencil aria-hidden className="size-3.5" />
                </button>
              </div>
            )}
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
              stopAt={null}
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

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label
              htmlFor="beitrag-md"
              className="block text-xs tracking-wide text-schrift-3 uppercase"
            >
              Text
            </label>
            <Button
              size="klein"
              variant="leise"
              onClick={() =>
                setMode((current) => (current === "schreiben" ? "lesen" : "schreiben"))
              }
            >
              {mode === "schreiben" ? (
                <>
                  <BookOpen aria-hidden className="size-3.5" />
                  Lesemodus
                </>
              ) : (
                <>
                  <PenLine aria-hidden className="size-3.5" />
                  Schreibmodus
                </>
              )}
            </Button>
          </div>
          <LivePreviewEditor
            ref={editor}
            id="beitrag-md"
            value={content}
            onChange={setContent}
            kind={kind}
            mode={mode}
            durationSeconds={durationSeconds}
            className="h-[60vh] w-full overflow-hidden rounded-xl border border-rand bg-grund-2"
          />
        </div>

        <p className="text-xs text-schrift-2">
          Kapitel sind Zeilen wie{" "}
          <code className="rounded bg-grund-3 px-1">01:24 Akku prüfen</code>{" "}
          zwischen den Markern. Alles außerhalb der Marker bleibt unberührt —
          auch wenn Claude Code später Kapitel und Zusammenfassungen einträgt.
          Solange der Cursor nicht in ihrer Zeile steht, werden Überschriften,
          Fett/Kursiv, Wikilinks und Marker-Blöcke dargestellt statt
          roh gezeigt — am Rohtext ändert das nichts. Im Schreibmodus setzt
          ein Klick auf einen Wikilink den Cursor in die Zeile,{" "}
          <kbd className="rounded bg-grund-3 px-1">Strg</kbd>+Klick folgt ihm
          trotzdem; im Lesemodus folgt jeder Klick. Mit{" "}
          <kbd className="rounded bg-grund-3 px-1">Strg</kbd>+
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
