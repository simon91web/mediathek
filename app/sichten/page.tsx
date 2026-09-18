import type { Metadata } from "next";

import { ScreeningPanel } from "@/components/screening/screening-panel";
import { ButtonLink, Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = { title: "Sichtung" };

export default async function SichtenPage() {
  const features = await getFeatures();

  if (!features.authorMode) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Sichtung ist ausgeschaltet">
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
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sichtung</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Bevor du importierst: ein schneller Blick, was in einem Ordner oder
          in ein paar Dateien steckt — und ob die Mediathek das schon kennt.
        </p>
      </div>

      <ScreeningPanel />
    </div>
  );
}
