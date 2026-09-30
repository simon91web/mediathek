"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Waypoints } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Werkzeug, kein Ort: der Graph zeigt, was schon da ist, statt einer
 * eigenen Art von Inhalt. Deshalb ein Symbol neben den anderen Werkzeugen,
 * kein sechster Punkt in der Hauptnavigation.
 */
export function GraphLink() {
  const pathname = usePathname();
  const active = pathname === "/graph";

  return (
    <Link
      href="/graph"
      title="Graph"
      aria-label="Graph"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-grund-3 text-schrift"
          : "text-schrift-2 hover:bg-grund-2 hover:text-schrift",
      )}
    >
      <Waypoints aria-hidden className="size-4" />
    </Link>
  );
}
