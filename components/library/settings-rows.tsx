import { Check, X } from "lucide-react";

/*
 * Die zwei Zeilenformen, die auf allen Einstellungsseiten vorkommen.
 *
 * Eigene Datei, seit die Einstellungen vier Seiten sind: vorher standen sie
 * am Ende der einen Seite, und die zweite Seite hätte sie kopiert.
 */

export function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-0.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <span className="text-schrift-2">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function ToolRow({
  state,
  label,
  okText,
  missingText,
}: {
  state: "ok" | "fehlt";
  label: string;
  okText: string;
  missingText: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {state === "ok" ? (
        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-akzent" />
      ) : (
        <X aria-hidden className="mt-0.5 size-4 shrink-0 text-schrift-3" />
      )}
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-schrift-2">
          {state === "ok" ? okText : missingText}
        </span>
      </span>
    </div>
  );
}
