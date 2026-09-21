import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { LibraryDirForm } from "@/components/library/library-dir-form";
import {
  AuthorModeControl,
  ReloadControl,
  SettingsSection,
} from "@/components/library/settings-controls";
import { Row } from "@/components/library/settings-rows";
import { Card } from "@/components/ui/basis";
import { getFeatures } from "@/lib/features";
import { getLibrary } from "@/lib/library";
import { defaultLibraryParent } from "@/lib/library/first-run";
import { formatBytes } from "@/lib/library/media-kind";
import { LIBRARY_DIR_FIXED } from "@/lib/paths";
import { searchIndexStatus } from "@/lib/search";
import { plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Einstellungen" };

const WATCH_LABEL = {
  recursive: "Änderungen werden gemeldet (auch in Unterordnern)",
  flach: "Änderungen werden gemeldet (nur die obersten Ordner)",
  poll: "Es wird regelmäßig nachgesehen",
  aus: "Änderungen werden nicht bemerkt",
} as const;

export default async function BibliothekPage() {
  const [library, features] = await Promise.all([
    getLibrary(),
    getFeatures(),
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
    <div className="space-y-8">
      <SettingsSection title="Bedienung">
        <AuthorModeControl
          authorMode={features.authorMode}
          readonly={features.readonly}
        />
      </SettingsSection>

      <SettingsSection
        title="Ordner"
        hint="jederzeit wechseln oder neu anlegen"
      >
        <LibraryDirForm
          current={library.root}
          fixed={LIBRARY_DIR_FIXED}
          pathExample={
            process.platform === "darwin"
              ? "/Volumes/…/Mediathek"
              : String.raw`S:\Mediathek`
          }
          suggestedParent={defaultLibraryParent()}
          suggestedName="Mediathek"
        />
      </SettingsSection>

      <SettingsSection title="Inhalt">
        <Row label="Beiträge">
          {plural(library.items.length, "Beitrag", "Beiträge")} · {byKind.video}{" "}
          Video, {byKind.audio} Audio, {byKind.text} Text
          {bytes > 0 ? ` · ${formatBytes(bytes)} Medien` : ""}
        </Row>
        <Row label="Erschließung">
          {plural(library.topics.length, "Thema", "Themen")} ·{" "}
          {plural(library.collections.length, "Sammlung", "Sammlungen")}
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
              {library.cache.note ?? "kann nicht geschrieben werden"}
            </span>
          )}
        </Row>

        <div className="border-t border-rand pt-4">
          <ReloadControl />
        </div>
      </SettingsSection>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-schrift-2 uppercase">
          Hinweise aus der Bibliothek
        </h2>
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
    </div>
  );
}
