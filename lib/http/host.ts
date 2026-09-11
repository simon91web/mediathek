/*
 * Die Positivliste für den Host-Header — gegen DNS-Rebinding.
 *
 * Der Server bindet auf 127.0.0.1, und das klingt sicher. Es genügt aber
 * nicht: eine Webseite, die im Browser offen ist, kann einen eigenen Namen
 * auf 127.0.0.1 auflösen lassen und dann von ihrem Ursprung aus mit diesem
 * Server sprechen — der Browser hält es für dieselbe Herkunft, weil der Name
 * derselbe ist. Ein Vergleich von Origin gegen Host hilft dagegen NICHT,
 * denn beide tragen dann den Namen des Angreifers. Geprüft werden muss der
 * NAME gegen eine Liste.
 *
 * Eigene Datei und nicht nur in proxy.ts, weil es zwei Aufrufer gibt: den
 * Proxy für alles Normale und die Upload-Route, die bewusst NICHT über den
 * Proxy läuft (siehe den Kommentar dort — er puffert und kürzt Rümpfe).
 * Ohne diese Datei hätte die Route entweder keine Prüfung oder eine zweite,
 * leicht abweichende.
 */

const BUILT_IN = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

/**
 * Darf unter diesem Host-Header geantwortet werden?
 *
 * `header` ist der rohe Wert inklusive Port. Fehlt er (HTTP/1.0, ein
 * Werkzeug), gibt es nichts zu prüfen.
 */
export function isAllowedHost(header: string | null): boolean {
  if (!header) return true;

  // Port abtrennen. Bei IPv6 steht die Adresse in eckigen Klammern.
  const host = header.toLowerCase().replace(/:\d+$/, "");

  // "app.localhost" und Ähnliches lösen immer auf die eigene Maschine auf.
  if (host === "localhost" || host.endsWith(".localhost")) return true;

  const extra = (process.env.MEDIATHEK_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return BUILT_IN.has(host) || extra.includes(host);
}

/** Der Text, den ein abgewiesener Aufruf zu lesen bekommt. */
export function wrongHostMessage(header: string | null): string {
  const host = (header ?? "").toLowerCase().replace(/:\d+$/, "");
  return (
    "Diese Mediathek antwortet nur auf 127.0.0.1 und localhost, nicht auf " +
    `"${host}". Soll sie unter diesem Namen erreichbar sein, muss ` +
    "MEDIATHEK_HOSTS gesetzt werden.\n"
  );
}
