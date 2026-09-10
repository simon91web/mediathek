import type { Metadata } from "next";
import Link from "next/link";

import { LibraryWatcher } from "@/components/library/library-watcher";
import { NavLinks } from "@/components/nav-links";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-30 border-b border-rand bg-grund/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
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
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

        <LibraryWatcher />
      </body>
    </html>
  );
}
