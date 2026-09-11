"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/*
 * Die Hauptnavigation — nur noch das, was man durchblättert.
 *
 * Suche, Importieren, Aufträge und Einstellungen stehen rechts als Symbole:
 * das sind Werkzeuge, keine Orte. "Mediathek" heißt hier "Medien", weil das
 * Wort schon im Logo daneben steht und zweimal dasselbe keine Orientierung
 * gibt.
 */
const NAV_ITEMS = [
  { href: "/medien", label: "Medien" },
  { href: "/themen", label: "Themen" },
  { href: "/sammlungen", label: "Sammlungen" },
  { href: "/fragen", label: "Fragen" },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 text-sm">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 transition-colors",
              active
                ? "bg-grund-3 font-medium text-schrift"
                : "text-schrift-2 hover:bg-grund-2 hover:text-schrift",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
