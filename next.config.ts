import type { NextConfig } from "next";

import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  env: {
    /*
     * Die App-Version wird zur Bauzeit eingebacken. Der Bibliotheks-Cache
     * hängt daran: nach einem Update wird er einmal neu aufgebaut, statt
     * Beiträge mit den Ergebnissen eines alten Parsers anzuzeigen.
     */
    MEDIATHEK_APP_VERSION: pkg.version,
  },
  /** Portables Viewer-Paket: nur die wirklich benoetigten node_modules. */
  output: "standalone",
  /*
   * Was nicht ins Paket gehört — allen voran die Entwicklungsbibliothek mit
   * ihren Mediendateien.
   *
   * NACHGEMESSEN: unter Turbopack wirkt das (Stand Next 16.3) NICHT. Der
   * standalone-Build enthält bibliothek-dev trotzdem. Die Angabe bleibt
   * stehen, weil sie korrekt geschrieben ist und greifen dürfte, sobald
   * Turbopack sie unterstützt — verlassen darf man sich aber nicht darauf.
   *
   * Der Ausschluss muss deshalb beim Bauen des Viewer-Pakets passieren
   * (Etappe 4, scripts/paket.mjs): dort wird gefiltert kopiert und
   * anschließend geprüft, dass keine Mediendatei und kein tools/ im Paket
   * liegt.
   *
   * Der Schlüssel ist ein ROUTEN-Glob und beginnt mit "/" — ein nacktes "*"
   * trifft keine Route und wäre in jedem Fall wirkungslos.
   */
  outputFileTracingExcludes: {
    "/**": [
      "./bibliothek-dev/**/*",
      "./e2e/**/*",
      "./test/**/*",
      "./tools/**/*",
      "./scripts/**/*",
      "./dist/**/*",
      "./test-results/**/*",
      "./playwright-report/**/*",
    ],
  },
  images: {
    /*
     * Kachelbilder kommen aus der Bibliothek ueber eine eigene Route. Der
     * Optimizer wuerde nur kopieren, braeuchte dafuer sharp (natives Modul,
     * dessen ABI zur mitgelieferten node.exe passen muesste) und einen
     * Plattencache -- beides Ballast in einem "Ordner kopieren"-Paket.
     */
    unoptimized: true,
  },
  poweredByHeader: false,
};

export default nextConfig;
