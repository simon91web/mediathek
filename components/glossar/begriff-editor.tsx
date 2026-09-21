"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Save } from "lucide-react";

import { saveGlossaryEntryAction } from "@/app/glossar/[slug]/bearbeiten/actions";
import type { SaveResult } from "@/app/glossar/[slug]/bearbeiten/actions";
import { Button, ButtonLink } from "@/components/ui/basis";
import { parseGlossaryMarkdown } from "@/lib/library/glossary";

/*
 * Ein strukturiertes Formular statt eines Rohtext-Editors — anders als
 * beitrag.md hat eine Begriffsdatei keine Kapitel und keine Marker, die man
 * sehen müsste; drei Felder genügen. Der Fundstellen-Block bleibt unter der
 * Haube: die Server Action baut ihn aus der zuletzt gelesenen Rohfassung
 * unverändert wieder ein (buildGlossaryMarkdown).
 */

export function BegriffEditor({
  slug,
  initialBegriff,
  initialSchreibweisen,
  initialDescription,
  initialRaw,
  initialMtimeMs,
}: {
  slug: string;
  initialBegriff: string;
  initialSchreibweisen: string[];
  initialDescription: string;
  initialRaw: string;
  initialMtimeMs: number | null;
}) {
  const router = useRouter();
  const [begriff, setBegriff] = useState(initialBegriff);
  const [schreibweisen, setSchreibweisen] = useState(
    initialSchreibweisen.join(", "),
  );
  const [description, setDescription] = useState(initialDescription);
  const [raw, setRaw] = useState(initialRaw);
  const [mtimeMs, setMtimeMs] = useState(initialMtimeMs);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{
    current: string;
    mtimeMs: number;
  } | null>(null);

  const dirty =
    begriff !== initialBegriff ||
    schreibweisen !== initialSchreibweisen.join(", ") ||
    description !== initialDescription;

  const save = useCallback(async () => {
    setSaving(true);
    setNote(null);
    const result: SaveResult = await saveGlossaryEntryAction(
      slug,
      { begriff, schreibweisen, description },
      raw,
      mtimeMs,
    );
    setSaving(false);

    if (result.ok) {
      setMtimeMs(result.mtimeMs);
      setConflict(null);
      setNote(result.message);
      router.refresh();
      return;
    }
    if (result.kind === "konflikt") {
      setConflict({ current: result.current, mtimeMs: result.mtimeMs });
      return;
    }
    setNote(result.error);
  }, [slug, begriff, schreibweisen, description, raw, mtimeMs, router]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-wide text-schrift-3 uppercase">
            Begriff bearbeiten
          </p>
          <p className="mt-0.5 text-xs text-schrift-3">
            glossar/{slug}.md{dirty ? " · nicht gespeichert" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/glossar/${slug}`} size="klein">
            Zur Ansicht
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

      {conflict ? (
        <div className="space-y-3 rounded-xl border border-warnung/40 bg-warnung-grund p-4">
          <p className="flex items-start gap-2 text-sm text-warnung">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-medium">
                Die Datei wurde außerhalb geändert
              </strong>{" "}
              — vermutlich hat Claude Code gerade Fundstellen eingetragen. Es
              wurde nichts gespeichert.
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="klein"
              onClick={() => {
                const parsed = parseGlossaryMarkdown(conflict.current, slug);
                setBegriff(parsed.begriff);
                setSchreibweisen(parsed.schreibweisen.join(", "));
                setDescription(parsed.description);
                setRaw(conflict.current);
                setMtimeMs(conflict.mtimeMs);
                setConflict(null);
                setNote("Die fremde Fassung wurde übernommen.");
              }}
            >
              Fremde Fassung übernehmen
            </Button>
            <Button
              size="klein"
              onClick={() => {
                setRaw(conflict.current);
                setMtimeMs(conflict.mtimeMs);
                setConflict(null);
                setNote(
                  "Der Zeitstempel wurde übernommen. Nochmals Speichern " +
                    "überschreibt die fremde Fassung.",
                );
              }}
            >
              Meine Fassung behalten
            </Button>
          </div>
        </div>
      ) : null}

      {note ? (
        <p role="status" className="text-sm text-akzent">
          {note}
        </p>
      ) : null}

      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs tracking-wide text-schrift-3 uppercase">
            Begriff
          </span>
          <input
            value={begriff}
            onChange={(event) => setBegriff(event.target.value)}
            className="h-10 w-full max-w-md rounded-lg border border-rand bg-grund-2 px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs tracking-wide text-schrift-3 uppercase">
            Schreibweisen
          </span>
          <input
            value={schreibweisen}
            onChange={(event) => setSchreibweisen(event.target.value)}
            placeholder="Mit Komma getrennt, auch falsch transkribierte"
            className="h-10 w-full max-w-md rounded-lg border border-rand bg-grund-2 px-3 text-sm"
          />
          <span className="mt-1 block text-xs text-schrift-3">
            Erweitert die Suche: wer nach „{begriff || "…"}“ sucht, findet
            damit auch Stellen mit diesen Schreibweisen.
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs tracking-wide text-schrift-3 uppercase">
            Definition
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={6}
            placeholder="Zwei bis drei Sätze. [[wikilinks]] auf Beiträge und andere Begriffe sind möglich."
            className="w-full rounded-lg border border-rand bg-grund-2 px-3 py-2 text-sm leading-relaxed"
          />
        </label>
      </div>
    </div>
  );
}
