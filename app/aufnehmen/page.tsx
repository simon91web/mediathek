import type { Metadata } from "next";
import Link from "next/link";

import { Recorder } from "@/components/aufnahme/recorder";
import { ButtonLink, Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = { title: "Aufnehmen" };

export default async function AufnehmenPage() {
  const features = await getFeatures();

  if (!features.authorMode) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Aufnehmen ist ausgeschaltet">
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

  if (features.ffmpeg !== "ok") {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Aufnehmen braucht ffmpeg">
          Der Browser nimmt in einem Format auf, das erst nach MP3 gewandelt
          werden muss — dafür wird ffmpeg gebraucht. Der Pfad lässt sich
          unter Einstellungen eintragen.
        </Leer>
        <div className="mt-4 flex justify-center">
          <ButtonLink href="/einstellungen" variant="primaer">
            Einstellungen
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aufnehmen</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Landet als Sprachmemo in der Bibliothek und wird direkt
          transkribiert — Kapitel, Suche und Bezüge laufen danach von selbst
          weiter. Der Fortschritt steht unter{" "}
          <Link href="/auftraege" className="text-akzent hover:underline">
            Aufträge
          </Link>
          .
        </p>
      </div>
      <Recorder />
    </div>
  );
}
