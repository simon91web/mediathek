"use client";

import { useState } from "react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import {
  FilePlus2,
  LayoutGrid,
  Mic,
  Settings,
  ScanSearch,
  Upload,
} from "lucide-react";

import { ImportDialog } from "@/components/import/import-dialog";
import { SichtenDialog } from "@/components/screening/sichten-dialog";
import { cn } from "@/lib/utils";

/*
 * Ein Button statt fünf: Einstellungen, Aufnehmen, Neuer Beitrag,
 * Importieren, Sichten waren fünf einzelne Symbole in der Kopfzeile — mehr
 * Wortliste als Werkzeugkasten. Import und Sichten öffnen jetzt außerdem als
 * schwebende Karte statt als eigene Seite: der Ausgangspunkt bleibt sichtbar
 * dahinter. Die Seiten /importieren und /sichten bleiben unverändert
 * bestehen — für Lesezeichen, direkte Adressen und die e2e-Tests.
 */

const ITEM_CLASS =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-schrift " +
  "outline-none data-[highlighted]:bg-grund-2 cursor-pointer select-none";

export function WerkzeugeMenu({ authorMode }: { authorMode: boolean }) {
  const [dialog, setDialog] = useState<"import" | "sichten" | null>(null);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            title="Werkzeuge"
            aria-label="Werkzeuge"
            data-tour="werkzeuge"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-md transition-colors",
              "text-schrift-2 hover:bg-grund-2 hover:text-schrift",
              "data-[state=open]:bg-grund-3 data-[state=open]:text-schrift",
            )}
          >
            <LayoutGrid aria-hidden className="size-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-40 w-56 rounded-xl border border-rand bg-grund p-1.5 shadow-lg"
          >
            <DropdownMenu.Item asChild>
              <Link href="/einstellungen" className={ITEM_CLASS}>
                <Settings aria-hidden className="size-4 shrink-0 text-schrift-2" />
                Einstellungen
              </Link>
            </DropdownMenu.Item>
            {authorMode ? (
              <>
                <DropdownMenu.Item asChild>
                  <Link href="/aufnehmen" className={ITEM_CLASS}>
                    <Mic aria-hidden className="size-4 shrink-0 text-schrift-2" />
                    Aufnehmen
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item asChild>
                  <Link href="/anlegen" className={ITEM_CLASS}>
                    <FilePlus2 aria-hidden className="size-4 shrink-0 text-schrift-2" />
                    Neuer Beitrag
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={ITEM_CLASS}
                  onSelect={() => setDialog("import")}
                >
                  <Upload aria-hidden className="size-4 shrink-0 text-schrift-2" />
                  Importieren
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={ITEM_CLASS}
                  onSelect={() => setDialog("sichten")}
                >
                  <ScanSearch aria-hidden className="size-4 shrink-0 text-schrift-2" />
                  Sichten
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ImportDialog
        open={dialog === "import"}
        onOpenChange={(next) => setDialog(next ? "import" : null)}
      />
      <SichtenDialog
        open={dialog === "sichten"}
        onOpenChange={(next) => setDialog(next ? "sichten" : null)}
      />
    </>
  );
}
