import { SettingsTabs } from "@/components/library/settings-tabs";

/*
 * Die Einstellungen sind vier Themen, nicht eine Liste.
 *
 * Vorher stand alles auf einer Seite: Bibliothekspfad, Autorenmodus,
 * Automatik, ffmpeg, Whisper, Assistent, Werkzeuge, Hinweise, Speicherorte.
 * Das war zum Scrollen zu lang und zum Suchen zu unsortiert — man wusste nie,
 * ob man etwas übersehen hatte.
 *
 * Vier eigene Seiten statt Reiter mit Zustand im Browser: jede ist für sich
 * verlinkbar, wird auf dem Server gerendert und bleibt klein.
 */
export default function EinstellungenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
      <SettingsTabs />
      {children}
    </div>
  );
}
