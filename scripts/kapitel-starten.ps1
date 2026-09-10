<#
.SYNOPSIS
    Öffnet ein sichtbares PowerShell-Fenster mit Claude Code im
    Bibliotheksordner.

.DESCRIPTION
    Die Mediathek erzeugt Kapitel, Zusammenfassungen, Bezüge und Themenseiten
    nicht selbst — das macht Claude Code extern auf den Transkripten. Dieses
    Skript ist die Brücke: es startet eine Sitzung, deren
    Arbeitsverzeichnis der Bibliotheksordner ist.

    Das Arbeitsverzeichnis ist der ganze Trick. Claude Code findet dort
    .claude\CLAUDE.md und .claude\commands\*.md der Bibliothek — die Regeln
    also, nach denen geschrieben werden darf. Kein --add-dir nötig.

    Das Fenster bleibt offen (-NoExit), damit man nachfragen, korrigieren
    oder weiterarbeiten kann. Der Knopf in der Mediathek ist nur
    Bequemlichkeit; der eigentliche Weg ist derselbe von Hand:

        cd S:\Mediathek
        claude
        /kapitel akku-pruefen

.NOTES
    Sicherheit: dieses Skript nimmt AUSSCHLIESSLICH Werte aus einer
    Positivliste an. -Command gegen ValidateSet, -Slug gegen
    ValidatePattern (dieselbe Grammatik wie SLUG_PATTERN in
    lib/library/slug.ts). Erst deshalb ist es vertretbar, für den Aufruf von
    "claude" eine Kommandozeile zu bauen: in $Command und $Slug kann kein
    Anführungszeichen, kein Semikolon und kein Ampersand stehen.

    Es wird nie von der Mediathek ein Kommandostring zusammengesetzt und
    ausgeführt — Node ruft powershell.exe mit -File und einzelnen
    Argumenten auf, nie mit shell: true.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # Der Bibliotheksordner. Wird zum Arbeitsverzeichnis der Sitzung.
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $LibraryDir,

    # Welcher Slash-Befehl. Positivliste, keine Freitexteingabe.
    [Parameter(Mandatory = $true)]
    [ValidateSet('kapitel', 'kapitel-alle', 'bezuege', 'themen', 'glossar')]
    [string] $Command,

    # Der Beitrag, falls der Befehl einen braucht.
    [ValidatePattern('^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')]
    [string] $Slug = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $LibraryDir -PathType Container)) {
    Write-Error "Der Bibliotheksordner existiert nicht: $LibraryDir"
    exit 1
}

# Verlangt der Befehl einen Beitrag, muss dessen Datei wirklich da sein.
$needsSlug = @('kapitel', 'bezuege') -contains $Command
if ($needsSlug) {
    if ([string]::IsNullOrWhiteSpace($Slug)) {
        Write-Error "Der Befehl /$Command braucht einen Beitrag (-Slug)."
        exit 1
    }
    $markdown = Join-Path $LibraryDir "medien\$Slug\beitrag.md"
    if (-not (Test-Path -LiteralPath $markdown -PathType Leaf)) {
        Write-Error "Es gibt keine Datei $markdown."
        exit 1
    }
}

$prompt = if ($needsSlug) { "/$Command $Slug" } else { "/$Command" }

<#
    Ein NEUES, sichtbares Fenster. Der Aufruf aus der Mediathek läuft ohne
    Fenster (windowsHide), und ein Claude Code, das niemand sieht, wäre in
    einer Wissensdatenbank das Letzte, was man will: man muss mitlesen,
    was in die eigenen Dateien geschrieben wird.
#>
$inner = "claude '$prompt'"

# -WhatIf zeigt, was gestartet WUERDE, und startet nichts. Nuetzlich, um vor
# dem ersten Klick nachzusehen, was der Knopf tatsaechlich tut.
if ($PSCmdlet.ShouldProcess("$LibraryDir", "claude $prompt")) {
    Start-Process -FilePath 'powershell.exe' `
        -WorkingDirectory $LibraryDir `
        -ArgumentList @('-NoExit', '-NoProfile', '-Command', $inner)

    Write-Output "Claude Code gestartet: $prompt (in $LibraryDir)"
}
