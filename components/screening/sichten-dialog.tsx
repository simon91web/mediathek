"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";

import { ScreeningPanel } from "@/components/screening/screening-panel";

/*
 * Sichten als schwebende Karte statt eigener Seite (Issue #3) — siehe
 * components/import/import-dialog.tsx für die Begründung. /sichten bleibt
 * als eigene Seite bestehen.
 */

export function SichtenDialog({
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
          className="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-full max-w-2xl
            -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl
            bg-grund p-6 shadow-2xl outline-none
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
            data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Dialog.Title className="text-xl font-semibold tracking-tight">
            Sichtung
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-schrift-2">
            Bevor du importierst: ein schneller Blick, was in einem Ordner
            oder in ein paar Dateien steckt — und ob die Mediathek das schon
            kennt.
          </Dialog.Description>

          <div className="mt-6">
            <ScreeningPanel />
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
