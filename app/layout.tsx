import type { Metadata } from "next";
import Link from "next/link";

import { HeaderActions, SettingsIcon } from "@/components/header-actions";
import { LibraryWatcher } from "@/components/library/library-watcher";
import { NavLinks } from "@/components/nav-links";
import { SearchBox } from "@/components/search/search-box";
import { Willkommen } from "@/components/start/willkommen";
import { getFeatures } from "@/lib/features";
import { firstRunState } from "@/lib/library/first-run";
import { readSettings } from "@/lib/settings";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Mediathek",
    template: "%s — Mediathek",
  },
  description: "Lokale Mediathek für Videos, Sprachmemos und Textbeiträge.",
};

/*
 * Die ganze App ist ein Blick in einen Ordner: es gibt nichts, was sich
 * vorberechnen ließe. Ohne diese Zeile versucht "next build" die Seiten zu
 * prerendern und backt eine leere Bibliothek in das Paket ein.
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [features, settings, ersterStart] = await Promise.all([
    getFeatures(),
    readSettings(),
    firstRunState(),
  ]);

  /*
   * Solange nicht feststeht, WO die Bibliothek liegt, gibt es nichts
   * anzuzeigen — also steht hier auch nichts anderes. Bewusst im Layout und
   * nicht als Weiterleitung: so führt jede Adresse zum selben Schirm, und es
   * gibt keine Schleife zwischen „weiterleiten" und „wieder aufrufen".
   */
  if (ersterStart.needed) {
    return (
      <html lang="de">
        <body className="min-h-dvh">
          <Willkommen
            lostDir={ersterStart.lostDir}
            suggestedParent={ersterStart.suggestedParent}
            suggestedName={ersterStart.suggestedName}
          />
        </body>
      </html>
    );
  }

  return (
    <html lang="de">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-30 border-b border-rand bg-grund/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <span
                aria-hidden
                className="grid size-7 place-items-center rounded-md bg-akzent text-[13px] font-bold text-white"
              >
                M
              </span>
              Mediathek
            </Link>
            <NavLinks />

            {/*
             * Werkzeuge statt Orte: Aufträge, Importieren, Suche,
             * Einstellungen. Das Suchfeld steht zwischen ihnen, weil es das
             * einzige ist, das man benutzt statt anzuklicken.
             */}
            <div className="ml-auto flex items-center gap-1">
              <HeaderActions
                authorMode={features.authorMode}
                chatEnabled={settings.chatEnabled && !features.readonly}
              />
              <div className="mx-1">
                <SearchBox compact />
              </div>
              <SettingsIcon />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

        <LibraryWatcher />
      </body>
    </html>
  );
}
