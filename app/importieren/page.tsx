import type { Metadata } from "next";

import { FolderImport } from "@/components/import/folder-import";
import { UploadDropzone } from "@/components/import/upload-dropzone";
import { ButtonLink, Card, Leer, SectionTitle } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { paths } from "@/lib/paths";

export const metadata: Metadata = { title: "Importieren" };

export default async function ImportPage() {
  const features = await getFeatures();

  if (!features.authorMode) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Leer titel="Importieren ist ausgeschaltet">
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
        <h1 className="text-2xl font-semibold tracking-tight">Importieren</h1>
        <p className="mt-1 text-sm text-schrift-2">
          Jede Datei bekommt einen eigenen Ordner unter{" "}
          <code className="rounded bg-grund-3 px-1 text-xs">
            {paths.items}
          </code>
          . Eine bereits vorhandene beitrag.md wird nie überschrieben.
        </p>
      </div>

      <section>
        <SectionTitle>Hochladen</SectionTitle>
        <UploadDropzone />
      </section>

      <section>
        <SectionTitle>Aus einem Ordner</SectionTitle>
        <Card>
          <FolderImport />
        </Card>
      </section>

      <section>
        <SectionTitle>Was danach passiert</SectionTitle>
        <Card className="space-y-2 text-sm text-schrift-2">
          <p>
            Die Mediendatei heißt in der Bibliothek{" "}
            <code className="rounded bg-grund-3 px-1 text-xs">video.mp4</code>{" "}
            beziehungsweise{" "}
            <code className="rounded bg-grund-3 px-1 text-xs">audio.m4a</code>.
            Ein führendes Datum im Dateinamen landet im Kopf der beitrag.md,
            nicht in der Kennung.
          </p>
          <p>
            Heißt eine Datei nur nach dem Gerät —{" "}
            <code className="rounded bg-grund-3 px-1 text-xs">GX010042</code>{" "}
            oder{" "}
            <code className="rounded bg-grund-3 px-1 text-xs">DJI_0042</code> —
            bleibt der Titel leer, statt Unsinn hineinzuschreiben. Er lässt
            sich beim Bearbeiten nachtragen.
          </p>
          <p>
            {features.ffmpeg === "ok"
              ? "Kachelbilder entstehen später über ffmpeg."
              : "Ohne ffmpeg gibt es keine Kachelbilder — abspielen lässt " +
                "sich trotzdem alles. Der Pfad steht unter Einstellungen."}
          </p>
        </Card>
      </section>
    </div>
  );
}
