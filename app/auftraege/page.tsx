import type { Metadata } from "next";

import { JobQueue } from "@/components/jobs/job-queue";
import { ButtonLink, Leer } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = { title: "Verlauf" };

export default async function AuftraegePage() {
  const features = await getFeatures();

  if (!features.authorMode) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Verlauf ist ausgeschaltet">
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verlauf</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Transkription, Kachelbilder und Text aus Anhängen. Es läuft immer nur
          eines — es gibt eine Grafikkarte, und zwei Whisper-Läufe gleichzeitig
          sind langsamer als zwei hintereinander.
        </p>
      </div>

      {features.python !== "ok" || features.ffmpeg !== "ok" ? (
        <p className="rounded-lg border border-warnung/40 bg-warnung-grund px-3 py-2 text-sm text-warnung">
          {features.python !== "ok"
            ? "Die Python-Umgebung fehlt — einzurichten unter Einstellungen → " +
              "Verarbeitung. "
            : ""}
          {features.ffmpeg !== "ok"
            ? "ffmpeg wurde nicht gefunden; siehe Einstellungen. "
            : ""}
          Solange wird das Betroffene übersprungen.
        </p>
      ) : null}

      <JobQueue />
    </div>
  );
}
