"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";

import { UploadDropzone } from "@/components/import/upload-dropzone";
import { FolderImport } from "@/components/import/folder-import";
import { Card, SectionTitle } from "@/components/ui/basis";
import { paths } from "@/lib/paths";

/*
 * Importieren als schwebende Karte statt eigener Seite (Issue #3) — vom
 * Werkzeuge-Menü aus geöffnet, der Ausgangspunkt bleibt sichtbar dahinter.
 * Die Seite /importieren bleibt daneben bestehen (Lesezeichen, e2e-Tests);
 * beide zeigen dieselben Bausteine, UploadDropzone und FolderImport sind
 * schon eigenständige Client-Komponenten mit eigener Server Action.
 */

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-full max-w-lg
            -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl
            bg-grund p-6 shadow-2xl outline-none
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
            data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Dialog.Title className="text-xl font-semibold tracking-tight">
            Importieren
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-schrift-2">
            Jede Datei bekommt einen eigenen Ordner unter{" "}
            <code className="rounded bg-grund-3 px-1 text-xs">
              {paths.items}
            </code>
            . Eine bereits vorhandene beitrag.md wird nie überschrieben.
          </Dialog.Description>

          <div className="mt-6 space-y-6">
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
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Schließen"
              className="absolute -top-3 -right-3 rounded-full border border-rand
                bg-grund-2 p-1.5 text-schrift-2 shadow-md hover:bg-grund-3
                hover:text-schrift"
            >
              <X aria-hidden className="size-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
