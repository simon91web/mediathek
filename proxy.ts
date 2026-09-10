import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/*
 * Eine Positivliste für den Host-Header — gegen DNS-Rebinding.
 *
 * Der Server bindet auf 127.0.0.1, und das klingt sicher. Es genügt aber
 * nicht: eine Webseite, die im Browser offen ist, kann einen eigenen Namen
 * auf 127.0.0.1 auflösen lassen und dann von ihrem Ursprung aus mit diesem
 * Server sprechen — der Browser hält es für dieselbe Herkunft, weil der Name
 * derselbe ist. Genau dafür ist diese Prüfung da: sie schaut nicht auf die
 * Adresse, sondern auf den NAMEN, unter dem angefragt wurde.
 *
 * Die Anwendung schreibt in Dateien und startet Prozesse. Hier lohnt der
 * doppelte Boden, auch wenn die Server Actions ohnehin Origin gegen Host
 * prüfen.
 *
 * Wer die Mediathek bewusst unter einem anderen Namen erreichen will, setzt
 * MEDIATHEK_HOSTS=mediathek.intern (mehrere durch Komma getrennt).
 *
 * Die Datei heißt "proxy.ts" und nicht "middleware.ts": ab Next 16.3 ist die
 * alte Benennung überholt, und "next build" sagt das auch. Gleiche Wirkung,
 * gleicher Ort — die exportierte Funktion heißt jetzt "proxy".
 */

const BUILT_IN = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

function allowedHosts(): Set<string> {
  const extra = (process.env.MEDIATHEK_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...BUILT_IN, ...extra]);
}

export function proxy(request: NextRequest) {
  const header = request.headers.get("host");
  // Kein Host-Header: HTTP/1.0 oder ein Werkzeug. Nichts zu prüfen.
  if (!header) return NextResponse.next();

  // Port abtrennen. Bei IPv6 steht die Adresse in eckigen Klammern.
  const host = header.toLowerCase().replace(/:\d+$/, "");

  // "app.localhost" und Ähnliches lösen immer auf die eigene Maschine auf.
  if (host === "localhost" || host.endsWith(".localhost")) {
    return NextResponse.next();
  }

  if (allowedHosts().has(host)) return NextResponse.next();

  return new NextResponse(
    `Diese Mediathek antwortet nur auf 127.0.0.1 und localhost, nicht auf ` +
      `"${host}". Soll sie unter diesem Namen erreichbar sein, muss ` +
      `MEDIATHEK_HOSTS gesetzt werden.\n`,
    { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

export const config = {
  /*
   * Alles außer den statischen Bauteilen. Die kommen aus demselben Server,
   * aber sie schreiben nichts, und jede geprüfte Anfrage kostet Zeit.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
