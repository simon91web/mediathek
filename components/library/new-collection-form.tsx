"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListOrdered, Plus, Search } from "lucide-react";

import { createCollectionAction } from "@/app/sammlungen/actions";
import { Button, Card } from "@/components/ui/basis";
import { cn } from "@/lib/utils";

/*
 * Eine neue Sammlung anlegen.
 *
 * Die Wahl zwischen den beiden Arten steht bewusst ganz vorn und nicht in
 * einem Feld weiter unten: sie entscheidet, was das Ding ist. Eine
 * Ausschnittsfolge ist eine Aussage ("in dieser Reihenfolge"), eine
 * gespeicherte Suche eine Frage ("was gibt es dazu?").
 */

type Art = "folge" | "suche";

export function NewCollectionForm() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [art, setArt] = useState<Art>("folge");
  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [suche, setSuche] = useState("");
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  if (!offen) {
    return (
      <div className="space-y-2">
        <Button variant="primaer" onClick={() => setOffen(true)}>
          <Plus aria-hidden className="size-4" />
          Neue Sammlung
        </Button>
        {hinweis ? <p className="text-sm text-akzent">{hinweis}</p> : null}
      </div>
    );
  }

  const absenden = () => {
    setFehler(null);
    startTransition(async () => {
      const result = await createCollectionAction({
        title: titel,
        description: beschreibung,
        query: art === "suche" ? suche : "",
      });
      if (!result.ok) {
        setFehler(result.error);
        return;
      }
      setHinweis(result.message);
      setOffen(false);
      setTitel("");
      setBeschreibung("");
      setSuche("");
      router.push(`/sammlungen/${result.slug}`);
    });
  };

  return (
    <Card className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Was soll es werden?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ArtWahl
            gewaehlt={art === "folge"}
            onClick={() => setArt("folge")}
            Icon={ListOrdered}
            titel="Ausschnittsfolge"
            text="Eine geordnete Liste von Stellen, abspielbar über Beitragsgrenzen hinweg. Die Reihenfolge ist die Aussage."
          />
          <ArtWahl
            gewaehlt={art === "suche"}
            onClick={() => setArt("suche")}
            Icon={Search}
            titel="Gespeicherte Suche"
            text="Läuft bei jedem Aufruf neu. Kommt ein Beitrag dazu, steht er von selbst mit drin."
          />
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="sammlung-titel" className="block text-sm font-medium">
          Titel
        </label>
        <input
          id="sammlung-titel"
          type="text"
          value={titel}
          autoFocus
          disabled={pending}
          onChange={(event) => setTitel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") absenden();
          }}
          placeholder="Alles zum Akku"
          className="h-10 w-full rounded-lg border border-rand bg-grund-2 px-3 text-sm disabled:opacity-50"
        />
        <p className="text-xs text-schrift-2">
          Aus dem Titel entsteht der Dateiname. Gibt es ihn schon, bekommt die
          neue Datei eine Ziffer — überschrieben wird nie etwas.
        </p>
      </div>

      {art === "suche" ? (
        <div className="space-y-1.5">
          <label htmlFor="sammlung-suche" className="block text-sm font-medium">
            Suchbegriff
          </label>
          <input
            id="sammlung-suche"
            type="text"
            value={suche}
            disabled={pending}
            onChange={(event) => setSuche(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") absenden();
            }}
            placeholder="zellspannung"
            className="h-10 w-full rounded-lg border border-rand bg-grund-2 px-3 font-mono text-sm disabled:opacity-50"
          />
          <p className="text-xs text-schrift-2">
            Dieselbe Anfrage wie im Suchfeld — auch Wortgruppen in
            Anführungszeichen.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="sammlung-text" className="block text-sm font-medium">
          Beschreibung{" "}
          <span className="text-schrift-3">(kann leer bleiben)</span>
        </label>
        <textarea
          id="sammlung-text"
          rows={2}
          value={beschreibung}
          disabled={pending}
          onChange={(event) => setBeschreibung(event.target.value)}
          placeholder="Wofür diese Folge gut ist."
          className="w-full rounded-lg border border-rand bg-grund-2 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      {fehler ? (
        <p className="rounded-lg border border-warnung/40 bg-warnung-grund px-3 py-2 text-sm text-warnung">
          {fehler}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primaer"
          disabled={
            pending || !titel.trim() || (art === "suche" && !suche.trim())
          }
          onClick={absenden}
        >
          {pending ? "Legt an …" : "Anlegen"}
        </Button>
        <Button
          variant="leise"
          disabled={pending}
          onClick={() => {
            setOffen(false);
            setFehler(null);
          }}
        >
          Abbrechen
        </Button>
      </div>
    </Card>
  );
}

function ArtWahl({
  gewaehlt,
  onClick,
  Icon,
  titel,
  text,
}: {
  gewaehlt: boolean;
  onClick: () => void;
  Icon: typeof ListOrdered;
  titel: string;
  text: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={gewaehlt}
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        gewaehlt
          ? "border-akzent bg-akzent/10"
          : "border-rand bg-grund-2 hover:border-akzent/50",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon aria-hidden className="size-4 shrink-0 text-schrift-3" />
        {titel}
      </span>
      <span className="mt-1 block text-xs text-schrift-2">{text}</span>
    </button>
  );
}
