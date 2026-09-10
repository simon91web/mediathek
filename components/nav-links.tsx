"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Routen sind deutsch — wie in den übrigen Werkzeugen. */
const NAV_ITEMS = [
  { href: "/medien", label: "Mediathek" },
  { href: "/kurse", label: "Kurse" },
  { href: "/importieren", label: "Importieren" },
  { href: "/einstellungen", label: "Einstellungen" },
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
