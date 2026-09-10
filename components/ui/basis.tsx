import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Die Handvoll UI-Bausteine, die die Mediathek braucht. Bewusst selbst
 * geschrieben statt über einen Generator geholt: es sind wenige Zeilen, sie
 * hängen an keiner weiteren Abhängigkeit, und im portablen Viewer-Paket
 * zählt jedes Kilobyte.
 */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm " +
  "font-medium transition-colors disabled:pointer-events-none " +
  "disabled:opacity-50 whitespace-nowrap";

const BUTTON_VARIANTS = {
  primaer:
    "bg-akzent text-white hover:bg-akzent-dunkel " +
    "dark:bg-akzent dark:hover:bg-akzent-hell",
  sekundaer:
    "border border-rand bg-grund-2 text-schrift hover:bg-grund-3",
  leise: "text-schrift-2 hover:bg-grund-2 hover:text-schrift",
} as const;

const BUTTON_SIZES = {
  klein: "h-8 px-2.5",
  normal: "h-10 px-4",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

export function buttonClass(
  variant: ButtonVariant = "sekundaer",
  size: ButtonSize = "normal",
  className?: string,
) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export function Button({
  variant = "sekundaer",
  size = "normal",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={buttonClass(variant, size, className)} {...props} />
  );
}

export function ButtonLink({
  variant = "sekundaer",
  size = "normal",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Badge({
  className,
  children,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-grund-3 px-1.5 py-0.5 " +
          "text-xs text-schrift-2",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-rand bg-grund-2 p-4",
        className,
      )}
      {...props}
    />
  );
}

/** Überschrift eines Abschnitts, überall gleich. */
export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-schrift-2 uppercase">
        {children}
      </h2>
      {hint ? <span className="text-xs text-schrift-3">{hint}</span> : null}
    </div>
  );
}

/** Leerer Zustand mit einem Satz, der weiterhilft. */
export function Leer({
  titel,
  children,
}: {
  titel: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-rand p-8 text-center">
      <p className="font-medium">{titel}</p>
      {children ? (
        <p className="mx-auto mt-2 max-w-prose text-sm text-schrift-2">
          {children}
        </p>
      ) : null}
    </div>
  );
}
