import type { Metadata } from "next";
import { AlertTriangle, Check, X } from "lucide-react";

import { SettingsControls } from "@/components/library/settings-controls";
import { WhisperSettings } from "@/components/library/whisper-settings";
import { Card, SectionTitle } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";
import { searchIndexStatus } from "@/lib/search";
import { libraryStateDir, readSettings, settingsFile } from "@/lib/settings";
import { formatBytes } from "@/lib/library/media-kind";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Einstellungen" };

const WATCH_LABEL = {
  recursive: "Änderungen werden gemeldet (auch in Unterordnern)",
  flach: "Änderungen werden gemeldet (nur die obersten Ordner)",
  poll: "Es wird regelmäßig nachgesehen",
  aus: "Änderungen werden nicht bemerkt",
} as const;

export default async function EinstellungenPage() {
  const [library, features, settings] = await Promise.all([
    getLibrary(),
    getFeatures(),
    readSettings(),
  ]);
  // Nur ablesen, nicht anstoßen: der Index baut sich beim ersten Suchen.
  const searchStatus = searchIndexStatus();

  const byKind = { video: 0, audio: 0, text: 0 };
  let bytes = 0;
  for (const item of library.items) {
    byKind[item.kind] += 1;
    bytes += item.assets.mediaBytes ?? 0;
  }

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>

      <section>
        <SectionTitle>Bibliothek</SectionTitle>
        <Card className="space-y-3">
          <Row label="Ordner">
            <code className="text-xs break-all">{library.root}</code>
          </Row>
          <Row label="Inhalt">
            {plural(library.items.length, "Beitrag", "Beiträge")} ·{" "}
            {byKind.video} Video, {byKind.audio} Audio, {byKind.text} Text ·{" "}
            {plural(library.topics.length, "Thema", "Themen")}
            {bytes > 0 ? ` · ${formatBytes(bytes)} Medien` : ""}
          </Row>
          <Row label="Zuletzt gelesen">
            {new Date(library.scannedAtMs).toLocaleTimeString("de-DE")} in{" "}
            {library.scanDurationMs} ms
          </Row>
          <Row label="Änderungen">
            <span
              className={
                library.watch.mode === "aus" ? "text-warnung" : undefined
              }
            >
              {WATCH_LABEL[library.watch.mode]}
            </span>
            {library.watch.error ? (
              <span className="mt-1 block text-xs text-schrift-2">
                {library.watch.error}
              </span>
            ) : null}
          </Row>
          <Row label="Suchindex">
            {searchStatus.state === "fertig"
              ? `${searchStatus.blocks} Textblöcke`
              : searchStatus.state === "baut"
                ? "wird gerade aufgebaut"
                : searchStatus.state === "abgebrochen"
                  ? "zu groß — es wird wörtlich gesucht"
                  : "wird beim ersten Suchen gebaut"}
          </Row>
          <Row label="Index">
            {library.cache.writable ? (
              <span>
                wird in <code className="text-xs">library.json</code> gemerkt
              </span>
            ) : (
              <span className="text-warnung">
                {library.cache.note ??
                  "kann nicht geschrieben werden"}
              </span>
            )}
          </Row>
        </Card>
      </section>

      <SettingsControls
        authorMode={features.authorMode}
        readonly={features.readonly}
        ffmpegDir={features.ffmpegDir}
      />

      {features.python === "ok" ? (
        <WhisperSettings
          model={settings.whisperModel}
          language={settings.whisperLanguage}
          gpuReady={features.python === "ok"}
        />
      ) : null}

      <section>
        <SectionTitle>Werkzeuge auf dieser Maschine</SectionTitle>
        <Card className="space-y-3">
          <ToolRow
            state={features.python}
            label="Python für die Transkription"
            okText="eingerichtet — Beiträge lassen sich transkribieren"
            missingText={'fehlt; einrichten mit "npm run setup:python"'}
          />
          <ToolRow
            state={features.ffmpeg}
            label="ffmpeg"
            okText={
              features.ffmpegDir
                ? `gefunden in ${features.ffmpegDir}`
                : "über den Suchpfad gefunden"
            }
            missingText="wird für Kachelbilder und die Tonspur gebraucht"
          />
          <ToolRow
            state={features.claude}
            label="Claude Code"
            okText="gefunden — Kapitel und Zusammenfassungen lassen sich erzeugen"
            missingText="wird erst für die Kapitel-Erzeugung gebraucht"
          />
          <p className="border-t border-rand pt-3 text-xs text-schrift-2">
            Diese Werkzeuge braucht nur, wer Beiträge einpflegt. Zum Ansehen
            genügt der Server.
          </p>
        </Card>
      </section>

      <section>
        <SectionTitle>Hinweise aus der Bibliothek</SectionTitle>
        {library.problems.length === 0 ? (
          <Card>
            <p className="text-sm text-schrift-2">
              Keine Auffälligkeiten — alle Ordner konnten gelesen werden.
            </p>
          </Card>
        ) : (
          <Card className="space-y-3">
            {library.problems.map((problem, index) => (
              <div key={index} className="flex gap-2 text-sm">
                <AlertTriangle
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-warnung"
                />
                <div className="min-w-0">
                  <p>{problem.message}</p>
                  <code className="text-xs break-all text-schrift-3">
                    {problem.path}
                  </code>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionTitle>Wo diese Mediathek ihre Notizen ablegt</SectionTitle>
        <Card className="space-y-2 text-sm">
          <Row label="Einstellungen">
            <code className="text-xs break-all">{settingsFile()}</code>
          </Row>
          <Row label="Arbeitsdaten">
            <code className="text-xs break-all">{libraryStateDir()}</code>
          </Row>
          <p className="border-t border-rand pt-2 text-xs text-schrift-2">
            Bewusst außerhalb der Bibliothek: der Ordner wird weitergegeben
            und herumkopiert, und Programmpfade oder Laufwerksbuchstaben
            gelten nur auf dieser Maschine. Klemmt etwas, kann dieser Ordner
            gelöscht werden.
          </p>
        </Card>
      </section>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-0.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <span className="text-schrift-2">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function ToolRow({
  state,
  label,
  okText,
  missingText,
}: {
  state: "ok" | "fehlt";
  label: string;
  okText: string;
  missingText: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {state === "ok" ? (
        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-akzent" />
      ) : (
        <X aria-hidden className="mt-0.5 size-4 shrink-0 text-schrift-3" />
      )}
      <span className="min-w-0">
        <span className="font-medium">{label}</span>{" "}
        <span className="text-schrift-2">
          {state === "ok" ? okText : missingText}
        </span>
      </span>
    </div>
  );
}
