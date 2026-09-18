"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
} from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";

import { analyzeLivePreviewLines, wikilinkLabel } from "@/lib/editor/live-preview";
import { findWikilinks, referenceHref } from "@/lib/library/wikilink";
import type { LinkTarget, MediaKind } from "@/lib/library/types";

/*
 * Der Editor selbst — wie bei Obsidians Live-Preview-Modus wird im
 * Lesemodus geschrieben, es gibt kein zweites Vorschau-Panel. Das ist reine
 * Darstellung über echtem Markdown-Text: analyzeLivePreviewLines() (die
 * einzige Stelle mit Wissen über Kapitel/Marker-Grammatik) sagt WAS eine
 * Zeile ist, dieses Modul WIE sie gezeichnet wird. Nur die Zeile mit dem
 * Cursor bleibt roh — jede andere Zeile ist dekoriert. Nichts wird
 * umgeschrieben: getippt und gespeichert wird immer derselbe Rohtext.
 *
 * Dazu, wie bei Obsidian, ein zweiter Umschalter zwischen Schreib- und
 * Lesemodus (LivePreviewMode) — optisch identisch, nur der Klick auf einen
 * Wikilink unterscheidet sich: im Schreibmodus setzt er den Cursor in die
 * Zeile (roh bearbeitbar), im Lesemodus folgt er dem Link. Strg/Cmd+Klick
 * folgt dem Link in beiden Modi.
 */

export type LivePreviewMode = "schreiben" | "lesen";

const HEADING_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "text-2xl font-semibold leading-snug",
  2: "text-xl font-semibold leading-snug",
  3: "text-base font-semibold leading-snug",
  4: "text-base font-semibold leading-snug",
};

const HIDE = Decoration.replace({});
const STRONG = Decoration.mark({ class: "font-semibold" });
const EM = Decoration.mark({ class: "italic" });
const LINE_FRONTMATTER = Decoration.line({
  class: "font-mono text-[12px] text-schrift-3",
});
const LINE_CODE = Decoration.line({
  class: "font-mono text-[13px] text-schrift-2",
});

/** Hält, ob getippt wird oder gelesen — als Teil des Editor-Zustands, damit
 *  ein Wechsel wie jede andere Änderung eine Dekoration neu aufbaut. */
const setMode = StateEffect.define<LivePreviewMode>();
const modeField = StateField.define<LivePreviewMode>({
  create: () => "schreiben",
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setMode)) return effect.value;
    return value;
  },
});

class WikilinkWidget extends WidgetType {
  constructor(
    readonly slug: string,
    readonly target: LinkTarget,
    readonly label: string,
    readonly mode: LivePreviewMode,
  ) {
    super();
  }
  eq(other: WikilinkWidget) {
    return (
      other.label === this.label &&
      other.mode === this.mode &&
      other.slug === this.slug &&
      JSON.stringify(other.target) === JSON.stringify(this.target)
    );
  }
  toDOM(view: EditorView) {
    const link = document.createElement("a");
    link.href = referenceHref(this.slug, this.target);
    link.className =
      "inline-flex items-baseline gap-1 rounded bg-akzent/10 px-1.5 py-0.5 " +
      "text-xs font-medium text-akzent no-underline hover:bg-akzent/20";
    link.innerHTML =
      '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">' +
      '<polygon points="5 3 19 12 5 21" fill="currentColor"></polygon></svg>';
    link.append(this.label);
    /*
     * Im Schreibmodus soll ein einfacher Klick die Zeile roh zeigen, nicht
     * den Beitrag verlassen — nur Strg/Cmd+Klick öffnet trotzdem. Im
     * Lesemodus öffnet jeder Klick, wie ein gewöhnlicher Link.
     */
    link.addEventListener("click", (event) => {
      if (this.mode === "lesen") return;
      if (event.ctrlKey || event.metaKey || event.button !== 0) return;
      event.preventDefault();
      view.dispatch({ selection: { anchor: view.posAtDOM(link) }, scrollIntoView: true });
      view.focus();
    });
    return link;
  }
}

class MarkerWidget extends WidgetType {
  constructor(
    readonly label: string,
    readonly mode: LivePreviewMode,
  ) {
    super();
  }
  eq(other: MarkerWidget) {
    return other.label === this.label && other.mode === this.mode;
  }
  toDOM() {
    const row = document.createElement("span");
    row.className = "flex w-full items-center gap-2 py-0.5";
    const left = document.createElement("span");
    left.className = "h-px flex-1 bg-rand";
    const pill = document.createElement("span");
    pill.className =
      "inline-flex items-center whitespace-nowrap rounded-full " +
      "bg-akzent/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-akzent";
    pill.textContent = this.label;
    const right = document.createElement("span");
    right.className = "h-px flex-1 bg-rand";
    row.append(left, pill, right);
    return row;
  }
  /*
   * Sonst ignoriert CodeMirror jeden Klick auf das Widget komplett (Vorgabe
   * der Bibliothek) — der Cursor käme im Schreibmodus nie in dieser Zeile
   * an. Im Lesemodus bleibt ein Klick dagegen wirkungslos, es gibt nichts
   * zu bearbeiten.
   */
  ignoreEvent() {
    return this.mode === "lesen";
  }
}

class ChapterWidget extends WidgetType {
  constructor(
    readonly time: string,
    readonly title: string,
    readonly mode: LivePreviewMode,
  ) {
    super();
  }
  eq(other: ChapterWidget) {
    return (
      other.time === this.time && other.title === this.title && other.mode === this.mode
    );
  }
  toDOM() {
    const row = document.createElement("span");
    row.className = "inline-flex items-baseline gap-2";
    const badge = document.createElement("span");
    badge.className =
      "rounded bg-grund-3 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-schrift-2";
    badge.textContent = this.time;
    const title = document.createElement("span");
    title.className = "text-[0.92rem]";
    title.textContent = this.title;
    row.append(badge, title);
    return row;
  }
  ignoreEvent() {
    return this.mode === "lesen";
  }
}

const HEADING_LINE = /^ {0,3}(#{1,6})(\s+)(.+?)\s*(#*)\s*$/;
const BOLD = /\*\*([^*\n]+)\*\*/g;
const ITALIC = /\*([^*\n]+)\*/g;

/** Ersetzt einen Bereich durch Leerzeichen, ohne die Länge zu ändern — so
 *  bleiben spätere Zeichenoffsets im selben Text gültig. */
function mask(text: string, from: number, to: number): string {
  return text.slice(0, from) + " ".repeat(to - from) + text.slice(to);
}

type PendingRange = { from: number; to: number; deco: Decoration };

function pushInlineDecorations(
  out: PendingRange[],
  lineFrom: number,
  text: string,
  mode: LivePreviewMode,
) {
  let masked = text;

  for (const link of findWikilinks(text)) {
    const from = lineFrom + link.index;
    const to = from + link.length;
    out.push({
      from,
      to,
      deco: Decoration.replace({
        widget: new WikilinkWidget(
          link.slug,
          link.target,
          wikilinkLabel(link.slug, link.target),
          mode,
        ),
      }),
    });
    masked = mask(masked, link.index, link.index + link.length);
  }

  BOLD.lastIndex = 0;
  let boldMatch: RegExpExecArray | null;
  while ((boldMatch = BOLD.exec(masked))) {
    const [whole, inner] = boldMatch;
    const start = lineFrom + boldMatch.index;
    out.push({ from: start, to: start + 2, deco: HIDE });
    out.push({ from: start + 2, to: start + 2 + inner.length, deco: STRONG });
    out.push({ from: start + 2 + inner.length, to: start + whole.length, deco: HIDE });
    masked = mask(masked, boldMatch.index, boldMatch.index + whole.length);
  }

  ITALIC.lastIndex = 0;
  let italicMatch: RegExpExecArray | null;
  while ((italicMatch = ITALIC.exec(masked))) {
    const [whole, inner] = italicMatch;
    const start = lineFrom + italicMatch.index;
    out.push({ from: start, to: start + 1, deco: HIDE });
    out.push({ from: start + 1, to: start + 1 + inner.length, deco: EM });
    out.push({ from: start + 1 + inner.length, to: start + whole.length, deco: HIDE });
    masked = mask(masked, italicMatch.index, italicMatch.index + whole.length);
  }
}

function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const from = view.state.doc.lineAt(range.from).number;
    const to = view.state.doc.lineAt(range.to).number;
    for (let n = from; n <= to; n += 1) lines.add(n);
  }
  return lines;
}

function buildDecorations(
  view: EditorView,
  kind: MediaKind,
  durationSeconds: number | null,
): DecorationSet {
  const doc = view.state.doc;
  const mode = view.state.field(modeField);
  const analysis = analyzeLivePreviewLines(doc.toString(), kind, durationSeconds);
  /*
   * Im Lesemodus gibt es keine "aktive" Zeile — sonst bliebe eine Zeile roh
   * stehen, nur weil dort zufällig noch der Cursor aus dem Schreibmodus
   * steht. Optisch soll sich nichts unterscheiden.
   */
  const active = mode === "schreiben" ? activeLines(view) : new Set<number>();
  const items: PendingRange[] = [];

  for (let n = 1; n <= doc.lines; n += 1) {
    if (active.has(n)) continue;
    const line = doc.line(n);
    const info = analysis.get(n);

    if (!info) {
      pushInlineDecorations(items, line.from, line.text, mode);
      continue;
    }

    switch (info.type) {
      case "frontmatter":
        items.push({ from: line.from, to: line.from, deco: LINE_FRONTMATTER });
        break;
      case "code":
        items.push({ from: line.from, to: line.from, deco: LINE_CODE });
        break;
      case "marker":
        items.push({
          from: line.from,
          to: line.to,
          deco: Decoration.replace({ widget: new MarkerWidget(info.label, mode) }),
        });
        break;
      case "chapter":
        items.push({
          from: line.from,
          to: line.to,
          deco: Decoration.replace({
            widget: new ChapterWidget(info.time, info.title, mode),
          }),
        });
        break;
      case "heading": {
        const match = HEADING_LINE.exec(line.text);
        if (!match) break;
        const [, hashes, space, title, trailing] = match;
        const markEnd = line.from + hashes.length + space.length;
        const titleEnd = markEnd + title.length;
        items.push({ from: line.from, to: markEnd, deco: HIDE });
        items.push({
          from: markEnd,
          to: titleEnd,
          deco: Decoration.mark({ class: HEADING_CLASS[info.level] }),
        });
        if (trailing) items.push({ from: titleEnd, to: line.to, deco: HIDE });
        break;
      }
    }
  }

  items.sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  for (const item of items) builder.add(item.from, item.to, item.deco);
  return builder.finish();
}

function livePreviewPlugin(kind: MediaKind, durationSeconds: number | null) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, kind, durationSeconds);
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.startState.field(modeField) !== update.state.field(modeField)
        ) {
          this.decorations = buildDecorations(update.view, kind, durationSeconds);
        }
      }
    },
    { decorations: (instance) => instance.decorations },
  );
}

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily:
      'ui-sans-serif, system-ui, "Segoe UI", -apple-system, sans-serif',
  },
  ".cm-content": {
    padding: "0.9rem 1rem",
    fontSize: "0.95rem",
    lineHeight: "1.65",
    caretColor: "var(--color-schrift)",
    color: "var(--color-schrift)",
    outline: "none",
  },
  ".cm-line": { padding: "0.05rem 0" },
});

export type LivePreviewEditorHandle = {
  focus: () => void;
  setSelection: (from: number, to: number) => void;
};

export const LivePreviewEditor = forwardRef<
  LivePreviewEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    kind: MediaKind;
    durationSeconds: number | null;
    mode: LivePreviewMode;
    id?: string;
    className?: string;
  }
>(function LivePreviewEditor(
  { value, onChange, kind, durationSeconds, mode, id, className },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  /*
   * Wahr, während der Effekt unten selbst einen Wechsel des `value`-Props in
   * das Dokument schreibt. Ohne das meldet der updateListener diese
   * Änderung an React zurück, React rendert mit demselben Text neu, der
   * Effekt greift erneut — beobachtet als "Maximum update depth exceeded".
   * Ein Vergleich mit dem zuletzt gemeldeten Text reicht nicht: bei
   * schnellem Tippen (oder einem Bulk-Insert) kommen mehrere CodeMirror-
   * Dispatches an, bevor React auch nur einmal neu rendert, und der
   * Vergleichswert wäre dann bereits veraltet.
   */
  const applyingExternalRef = useRef(false);
  /*
   * Ist NICHT null, während ein gemeldeter Text noch auf React wartet. Ein
   * einzelner Tastendruck-Schub (oder ein Bulk-Insert) kann mehrere native
   * DOM-Änderungen in einem Rutsch anliefern — CodeMirror verarbeitet die
   * dann als mehrere Dispatches hintereinander, jeder mit eigenem
   * docChanged. Würde jeder synchron ein eigenes setState auslösen, wirft
   * React "Maximum update depth exceeded", obwohl es keine echte
   * Endlosschleife ist. Deshalb wird nur EIN Meldevorgang je Schub
   * eingeplant; spätere Dispatches überschreiben nur noch den Text, der
   * dabei ankommt.
   *
   * Nachgemessen: `queueMicrotask` reicht dafür NICHT — Microtasks laufen
   * alle vor dem nächsten Rendern ab, sodass React dieselbe Update-Kette
   * sieht. Erst `setTimeout` (eine echte Aufgabe, nach der der Browser
   * zwischendurch rendern kann) hält React davon ab, die Kette als eine
   * einzige verschachtelte Aktualisierung zu zählen.
   */
  const pendingTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      doc: value,
      parent: hostRef.current,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        modeField,
        EditorView.editable.compute([modeField], (state) =>
          state.field(modeField) === "schreiben",
        ),
        livePreviewPlugin(kind, durationSeconds),
        theme,
        EditorView.contentAttributes.of(
          id ? { spellcheck: "false", id } : { spellcheck: "false" },
        ),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || applyingExternalRef.current) return;
          const alreadyScheduled = pendingTextRef.current !== null;
          pendingTextRef.current = update.state.doc.toString();
          if (alreadyScheduled) return;
          setTimeout(() => {
            const text = pendingTextRef.current;
            pendingTextRef.current = null;
            if (text !== null) onChangeRef.current(text);
          }, 0);
        }),
      ],
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    /*
     * Bewusst nur einmal aufgebaut: kind/durationSeconds ändern sich nicht
     * während dieser Seite lebt, `value` und `mode` werden über die Effekte
     * unten synchron gehalten, statt die Extensions neu aufzusetzen.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    applyingExternalRef.current = true;
    try {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    } finally {
      applyingExternalRef.current = false;
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.field(modeField) === mode) return;
    view.dispatch({ effects: setMode.of(mode) });
  }, [mode]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    setSelection: (from, to) => {
      const view = viewRef.current;
      if (!view) return;
      view.focus();
      view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
    },
  }));

  return <div ref={hostRef} className={className} />;
});
