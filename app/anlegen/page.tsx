import type { Metadata } from "next";

import { NewItemForm } from "@/components/editor/new-item-form";
import { ButtonLink, Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = { title: "Neuer Beitrag" };

export default async function NeuPage() {
  const features = await getFeatures();

  if (!features.authorMode) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Anlegen ist ausgeschaltet">
          {features.readonly
            ? "Diese Mediathek ist zum Ansehen eingerichtet."
            : "Der Autorenmodus ist aus. Er lässt sich unter Einstellungen " +
              "einschalten."}
        </Leer>
        <div className="mt-4 flex justify-center gap-2">
          <ButtonLink href="/medien" variant="primaer">
            Zur Mediathek
          </ButtonLink>
          {features.readonly ? null : (
            <ButtonLink href="/einstellungen">Einstellungen</ButtonLink>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Neuer Beitrag
        </h1>
        <p className="mt-1 text-sm text-schrift-2">
          Legt einen Ordner mit einer beitrag.md an. Für ein Video oder
          Sprachmemo lässt sich die Mediendatei danach in den Ordner legen —
          oder gleich über den Import einsortieren.
        </p>
      </div>
      <NewItemForm />
    </div>
  );
}
