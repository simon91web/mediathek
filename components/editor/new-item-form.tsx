"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createItemAction } from "@/app/anlegen/actions";
import { Button, Card } from "@/components/ui/basis";
import { slugify } from "@/lib/library/slug";
import type { MediaKind } from "@/lib/library/types";
import { cn } from "@/lib/utils";

const KINDS: Array<{ value: MediaKind; label: string; hint: string }> = [
  {
    value: "text",
    label: "Text",
    hint: "Ein Markdown-Dokument. Die Überschriften werden zu Abschnitten.",
  },
  {
    value: "video",
    label: "Video",
    hint: "Die video-Datei kommt danach in den Ordner.",
  },
  {
    value: "audio",
    label: "Sprachmemo",
    hint: "Die audio-Datei kommt danach in den Ordner.",
  },
];

export function NewItemForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<MediaKind>("text");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Der Vorschlag folgt dem Titel, solange niemand von Hand eingreift.
  const [slugTouched, setSlugTouched] = useState(false);
  const effectiveSlug = slugTouched ? slug : slugify(title);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createItemAction({
        title,
        slug: effectiveSlug,
        kind,
        tags,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Direkt in den Editor: dort wird der Inhalt geschrieben.
      router.push(`/medien/${result.slug}/bearbeiten`);
    });
  };

  return (
    <Card className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="neu-titel" className="block text-sm font-medium">
          Titel
        </label>
        <input
          id="neu-titel"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Zum Beispiel: Ein Messprotokoll lesen"
          className="w-full rounded-lg border border-rand bg-grund px-3 py-2 text-sm"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Art</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {KINDS.map((entry) => (
            <label
              key={entry.value}
              className={cn(
                "cursor-pointer rounded-lg border p-2.5 text-sm transition-colors",
                kind === entry.value
                  ? "border-akzent bg-akzent/5"
                  : "border-rand hover:bg-grund-3",
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="art"
                  value={entry.value}
                  checked={kind === entry.value}
                  onChange={() => setKind(entry.value)}
                  className="accent-akzent"
                />
                <span className="font-medium">{entry.label}</span>
              </span>
              <span className="mt-1 block text-xs text-schrift-2">
                {entry.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="neu-slug" className="block text-sm font-medium">
          Kennung
        </label>
        <input
          id="neu-slug"
          type="text"
          value={effectiveSlug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          spellCheck={false}
          placeholder="wird-aus-dem-titel-gebildet"
          className="w-full rounded-lg border border-rand bg-grund px-3 py-2 font-mono text-xs"
        />
        <p className="text-xs text-schrift-2">
          Wird der Ordnername und Teil der Adresse. Umlaute werden zu ae, oe,
          ue und ss. Auf sie zeigen später auch Verweise wie{" "}
          <code className="rounded bg-grund-3 px-1">
            [[{effectiveSlug || "kennung"}]]
          </code>
          , deshalb später besser nicht mehr ändern.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="neu-tags" className="block text-sm font-medium">
          Schlagworte <span className="text-schrift-3">(freiwillig)</span>
        </label>
        <input
          id="neu-tags"
          type="text"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="akku, grundlagen"
          className="w-full rounded-lg border border-rand bg-grund px-3 py-2 text-sm"
        />
      </div>

      {error ? <p className="text-sm text-warnung">{error}</p> : null}

      <div className="flex justify-end gap-2 border-t border-rand pt-4">
        <Button
          variant="primaer"
          disabled={pending || !title.trim() || !effectiveSlug}
          onClick={submit}
        >
          {pending ? "Wird angelegt …" : "Anlegen und bearbeiten"}
        </Button>
      </div>
    </Card>
  );
}
