"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { FolderTree, LayoutGrid, Power, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Orte und das Programm: Bibliothek, Einstellungen, Beenden.
 * Schreiben (Aufnehmen, Import, …) liegt im Plus daneben, nur im Autorenmodus.
 */

const ITEM_CLASS =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-schrift " +
  "outline-none data-[highlighted]:bg-grund-2 cursor-pointer select-none";

export function WerkzeugeMenu() {
  return (
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
              <FolderTree aria-hidden className="size-4 shrink-0 text-schrift-2" />
              Bibliothek wechseln
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/einstellungen" className={ITEM_CLASS}>
              <Settings aria-hidden className="size-4 shrink-0 text-schrift-2" />
              Einstellungen
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-rand" />
          <DropdownMenu.Item
            className={ITEM_CLASS}
            onSelect={() => {
              void fetch("/api/beenden", { method: "POST" }).catch(() => {});
            }}
          >
            <Power aria-hidden className="size-4 shrink-0 text-schrift-2" />
            Mediathek beenden
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
