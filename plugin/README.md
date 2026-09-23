# Medienwerkbank

Obsidian-Plugin für den Autorenweg einer Mediathek. Lesen braucht es nicht.

Es legt die Anleitungen in den Vault, wenn sie fehlen, und überschreibt keine vorhandene Datei. Die Befehle starten ein Kommandozeilenwerkzeug im Vault-Ordner. Der Auftrag ist ein Satz auf die Anleitung. Grok liest ihn aus einer Datei, Claude von der Standardeingabe. Dateien ändern ist eingeschaltet, das Netz ist bei Grok aus.

Ein Knopf „ab hier“ an einer Kapitelüberschrift (`### 00:30 Akku prüfen`) setzt die Abspielposition des eingebetteten Films in derselben Notiz. Am nächsten Kapitel hält er an.

Die Transkription liegt noch nicht in diesem Plugin. Ohne `transcript.json` neben der Notiz bricht die Anleitung ab.

## Installation

```bash
cd plugin
npm install
npm test
npm run build
```

`main.js`, `manifest.json`, `styles.css` und den Ordner `bundled/` nach `<Vault>/.obsidian/plugins/medienwerkbank/` kopieren. Obsidian neu laden, Medienwerkbank aktivieren.

Befehl: **Fehlende Anleitungen in den Vault legen**.
