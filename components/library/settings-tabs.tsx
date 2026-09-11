"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Cog, FolderTree, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/einstellungen", label: "Bibliothek", Icon: FolderTree },
  { href: "/einstellungen/verarbeitung", label: "Verarbeitung", Icon: Wand2 },
  { href: "/einstellungen/assistent", label: "KI-Assistent", Icon: Bot },
  { href: "/einstellungen/programm", label: "Programm", Icon: Cog },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Bereiche der Einstellungen"
      className="flex flex-wrap gap-1 border-b border-rand pb-2"
    >
      {TABS.map(({ href, label, Icon }) => {
        /*
         * "/einstellungen" ist der Anfang jedes anderen Pfads — deshalb hier
         * genaue Gleichheit statt startsWith, sonst wäre der erste Reiter
         * immer mit hervorgehoben.
         */
        const active =
          href === "/einstellungen"
            ? pathname === href
            : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-grund-3 font-medium text-schrift"
                : "text-schrift-2 hover:bg-grund-2 hover:text-schrift",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
