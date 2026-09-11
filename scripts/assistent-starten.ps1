<#
.SYNOPSIS
    Oeffnet ein sichtbares Fenster mit einem KI-Kommandozeilenwerkzeug im
    Bibliotheksordner.

.DESCRIPTION
    Die Mediathek erzeugt Kapitel, Zusammenfassungen, Bezuege und
    Themenseiten nicht selbst. Das macht ein Werkzeug nach Wahl auf den
    Transkripten. Dieses Skript ist die Bruecke: es startet eine Sitzung,
    deren Arbeitsverzeichnis der Bibliotheksordner ist.

    Das Arbeitsverzeichnis ist der ganze Trick. Dort liegen AGENTS.md und
    anleitungen/*.md -- die Regeln also, nach denen geschrieben werden darf.

    WERKZEUGUNABHAENGIG: -Tool ist frei waehlbar (claude, codex, gemini,
    grok, ...). Uebergeben wird ein gewoehnlicher Auftragstext, kein
    Slash-Befehl -- den kennt nur Claude Code. Der Text nennt die Anleitung,
    die zu befolgen ist; lesen kann sie jedes Werkzeug, das Dateien im
    Arbeitsverzeichnis oeffnet.

    Das Fenster bleibt offen (-NoExit), damit man mitlesen, nachfragen und
    korrigieren kann. Der Knopf in der Mediathek ist Bequemlichkeit; der
    eigentliche Weg ist derselbe von Hand:

        cd S:\Mediathek
        claude
        Befolge die Anweisungen in anleitungen/kapitel.md ...

.NOTES
    Sicherheit: alle Werte kommen aus einer Positivliste. -Tool darf nur aus
    Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich bestehen (also
    kein Pfad, kein Leerzeichen, kein Anfuehrungszeichen), -Prompt nur aus
    harmlosen Textzeichen, -Slug aus der Slug-Grammatik. Erst deshalb ist es
    vertretbar, fuer den Aufruf eine Kommandozeile zu bauen.

    Die Mediathek ruft powershell.exe mit -File und einzelnen Argumenten auf,
    nie mit shell: true.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # Der Bibliotheksordner. Wird zum Arbeitsverzeichnis der Sitzung.
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $LibraryDir,

    # Das aufzurufende Programm. Kein Pfad -- es muss im Suchpfad liegen.
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9._-]{1,40}$')]
    [string] $Tool,

    # Der Auftragstext. Bewusst eng: keine Anfuehrungszeichen, kein
    # Semikolon, kein Ampersand, keine Klammern.
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[\w\säöüÄÖÜß.,:/\-]{1,400}$')]
    [string] $Prompt,

    # Argumente vor dem Auftragstext, etwa "exec" oder "-p".
    [ValidatePattern('^[A-Za-z0-9._-]{0,40}$')]
    [string[]] $ToolArgs = @(),

    # Nur zur Kontrolle in der Meldung; die Pruefung macht die Mediathek.
    [ValidatePattern('^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')]
    [string] $Slug = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $LibraryDir -PathType Container)) {
    Write-Error "Der Bibliotheksordner existiert nicht: $LibraryDir"
    exit 1
}

if (-not (Get-Command $Tool -ErrorAction SilentlyContinue)) {
    Write-Error "Das Werkzeug '$Tool' wurde nicht gefunden. Steht es im Suchpfad?"
    exit 1
}

if ($Slug) {
    $markdown = Join-Path $LibraryDir "medien\$Slug\beitrag.md"
    if (-not (Test-Path -LiteralPath $markdown -PathType Leaf)) {
        Write-Error "Es gibt keine Datei $markdown."
        exit 1
    }
}

<#
    Ein NEUES, sichtbares Fenster.

    -WindowStyle Normal ist nicht Kosmetik. Die Mediathek ruft dieses Skript
    mit windowsHide auf, damit beim Klick keine leere Konsole aufblitzt. Ohne
    die ausdrueckliche Angabe kann dieses "versteckt" an das neue Fenster
    weitergereicht werden -- dann laeuft das Werkzeug unsichtbar, und am Knopf
    sieht es aus, als passiere nichts.
#>
$argumente = ($ToolArgs + @("'$Prompt'")) -join ' '
$inner = "$Tool $argumente"

if ($PSCmdlet.ShouldProcess("$LibraryDir", $inner)) {
    Start-Process -FilePath 'powershell.exe' `
        -WindowStyle Normal `
        -WorkingDirectory $LibraryDir `
        -ArgumentList @('-NoExit', '-NoProfile', '-Command', $inner)

    Write-Output "Gestartet: $inner (in $LibraryDir)"
}
