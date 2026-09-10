"""Transkription mit faster-whisper, gesteuert vom Node-Server.

Aufruf (alle Pfade absolut):

    tools/.venv/Scripts/python.exe tools/transcribe.py
        --media      "<Bibliothek>/medien/<slug>/video.mp4"
        --out-dir    "<Bibliothek>/medien/<slug>"
        --work-dir   "%LOCALAPPDATA%/Mediathek/<libhash>/work/<jobId>"
        --job-id     01JQ8...
        [--model large-v3-turbo] [--device auto] [--compute-type auto]
        [--language de] [--beam-size 5]
        [--ffmpeg "...\\ffmpeg.exe"] [--ffprobe "...\\ffprobe.exe"]
        [--initial-prompt-file "<work>/prompt.txt"]
        [--probe-only] [--keep-wav]

Auf **stdout stehen ausschließlich JSON-Lines**, eine Zeile je Ereignis.
Alles Menschenlesbare geht auf stderr und landet im Job-Protokoll.

Regel: kein Freitext auf der Kommandozeile. Ein Glossar oder ein
Anfangs-Prompt kommt als Datei herein — das ist gleichzeitig die
Absicherung dagegen, dass Nutzereingaben in eine Kommandozeile geraten.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

# Muss VOR den schweren Importen stehen: sonst schlägt der erste Umlaut in
# einer Ausgabe fehl (Python 3.14 nutzt beim Pipe cp1252) und der Lauf
# stirbt mitten in einem 90-Minuten-Video.
try:
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    sys.stderr.reconfigure(encoding="utf-8", newline="\n")
except Exception:
    pass

from procutil import no_window_kwargs, popen_managed  # noqa: E402

PROTOCOL_VERSION = 1


# ─────────────────────────────────────────────── Ausgabe (JSON-Lines)

def emit(event_type: str, **fields) -> None:
    """Eine Ereigniszeile auf stdout. ensure_ascii aus, sofort geleert."""
    line = json.dumps(
        {"v": PROTOCOL_VERSION, "type": event_type, **fields},
        ensure_ascii=False,
    )
    print(line, flush=True)


def log(message: str) -> None:
    """Für Menschen. Landet im Job-Protokoll, nie auf stdout."""
    print(message, file=sys.stderr, flush=True)


def fail(code: str, message: str, detail: str = "") -> "NoReturn":  # type: ignore[name-defined]
    emit("error", code=code, message=message, detail=detail)
    sys.exit(1)


# ─────────────────────────────────────────────── cuBLAS auffindbar machen

def prepare_cuda_path() -> str | None:
    """Legt das cuBLAS-Verzeichnis VOR den Suchpfad.

    Nachgemessen und der wichtigste Kniff der ganzen Datei:

    * ``os.add_dll_directory()`` wirkt NICHT. ctranslate2 lädt cuBLAS beim
      ersten Matrixprodukt per einfachem ``LoadLibrary``; AddDllDirectory
      greift nur bei ``LoadLibraryEx`` mit LOAD_LIBRARY_SEARCH_*-Flags. Das
      ist der Rat, den man überall liest, und er scheitert lautlos.
    * Das Voranstellen an ``PATH`` funktioniert.

    Der Node-Server setzt den Pfad ohnehin im Kind-Env. Das hier ist die
    Selbstheilung für einen Aufruf von Hand aus dem Terminal.
    """
    if os.name != "nt":
        return None

    candidates: list[Path] = []
    site = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia" / "cublas" / "bin"
    candidates.append(site)
    for entry in sys.path:
        if not entry:
            continue
        candidates.append(Path(entry) / "nvidia" / "cublas" / "bin")

    for directory in candidates:
        try:
            if not (directory / "cublas64_12.dll").is_file():
                continue
        except OSError:
            continue
        current = os.environ.get("PATH", "")
        if str(directory).lower() not in current.lower():
            os.environ["PATH"] = f"{directory}{os.pathsep}{current}"
        return str(directory)
    return None


# ─────────────────────────────────────────────── ffmpeg / ffprobe

def probe_media(ffprobe: str, media: Path) -> dict:
    """Dauer und Tonspur-Angaben. Autoritativ für den Fortschritt."""
    command = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(media),
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            **no_window_kwargs(),
        )
    except FileNotFoundError:
        fail(
            "ffmpeg_missing",
            f"ffprobe wurde nicht gefunden ({ffprobe}).",
        )
    except subprocess.TimeoutExpired:
        fail("ffmpeg_failed", "ffprobe hat nicht geantwortet.")

    if result.returncode != 0:
        fail(
            "ffmpeg_failed",
            "ffprobe konnte die Datei nicht lesen.",
            result.stderr.strip()[-2000:],
        )

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        fail("ffmpeg_failed", "ffprobe lieferte keine lesbare Antwort.", str(exc))

    streams = data.get("streams") or []
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if audio is None:
        fail(
            "no_audio_stream",
            "Diese Datei hat keine Tonspur — es gibt nichts zu transkribieren.",
        )

    duration = 0.0
    for source in (data.get("format", {}).get("duration"), audio.get("duration")):
        try:
            value = float(source)
        except (TypeError, ValueError):
            continue
        if value > 0:
            duration = value
            break

    return {
        "duration_sec": duration,
        "audio_codec": audio.get("codec_name"),
        "channels": audio.get("channels"),
        "sample_rate": audio.get("sample_rate"),
    }


def extract_audio(ffmpeg: str, media: Path, target: Path, duration: float) -> None:
    """Tonspur als 16-kHz-Mono-WAV.

    faster-whisper könnte das mp4 auch direkt lesen (PyAV liegt im venv), aber
    ffprobe brauchen wir ohnehin, und ein zweiter, anders gebauter Decoder ist
    eine Variable zu viel. Außerdem ist die WAV wiederverwendbar: ein zweiter
    Versuch mit anderem Modell — oder der CPU-Rückfall — decodiert nicht neu.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-progress",
        "pipe:1",
        "-nostats",
        "-i",
        str(media),
        # Erste Tonspur, alles andere weg. Das Fragezeichen macht die Auswahl
        # nachgiebig, wenn es keine zweite Spur gibt.
        "-map",
        "0:a:0?",
        "-vn",
        "-sn",
        "-dn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        str(target),
    ]

    emit("stage", stage="ffmpeg", message="Tonspur wird gelesen …")
    process = popen_managed(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        **no_window_kwargs(),
    )

    last_emit = 0.0
    assert process.stdout is not None
    for line in process.stdout:
        # -progress schreibt Schlüssel=Wert je Zeile, u.a. out_time_us.
        match = re.match(r"out_time_us=(\d+)", line.strip())
        if not match or duration <= 0:
            continue
        done = int(match.group(1)) / 1_000_000
        now = time.monotonic()
        if now - last_emit < 0.5:
            continue
        last_emit = now
        emit(
            "progress",
            stage="ffmpeg",
            done_sec=round(done, 2),
            total_sec=round(duration, 2),
            ratio=round(min(1.0, max(0.0, done / duration)), 4),
        )

    stderr = process.stderr.read() if process.stderr else ""
    code = process.wait()
    if code != 0 or not target.is_file() or target.stat().st_size == 0:
        fail(
            "ffmpeg_failed",
            "Die Tonspur konnte nicht gelesen werden.",
            stderr.strip()[-2000:],
        )


# ─────────────────────────────────────────────── Gerätewahl

# Auf CPU gibt es kein float16 — nachgemessen:
#   get_supported_compute_types("cpu") = {int8, int8_float32, float32, int16}
# Ein Rückfall muss deshalb Modell UND Rechenart umschreiben, sonst läuft man
# in einen stillen Ersatz oder einen Fehler.
CPU_FALLBACK = {"model": "small", "compute_type": "int8", "cpu_threads": 8}


def choose_device(requested_device: str, requested_compute: str) -> tuple[str, str, str | None]:
    """Liefert (device, compute_type, grund_für_rückfall)."""
    import ctranslate2

    want_cuda = requested_device in ("auto", "cuda")
    if not want_cuda:
        compute = (
            requested_compute
            if requested_compute != "auto"
            else CPU_FALLBACK["compute_type"]
        )
        return "cpu", compute, None

    try:
        count = ctranslate2.get_cuda_device_count()
    except Exception as exc:
        return "cpu", CPU_FALLBACK["compute_type"], f"CUDA nicht abfragbar: {exc}"

    if count <= 0:
        return (
            "cpu",
            CPU_FALLBACK["compute_type"],
            "Keine NVIDIA-Karte gefunden.",
        )

    supported = set(ctranslate2.get_supported_compute_types("cuda"))
    if requested_compute != "auto":
        if requested_compute not in supported:
            return (
                "cpu",
                CPU_FALLBACK["compute_type"],
                f"Die Rechenart {requested_compute} kann diese Karte nicht.",
            )
        return "cuda", requested_compute, None

    for candidate in ("float16", "int8_float16", "float32"):
        if candidate in supported:
            return "cuda", candidate, None
    return "cpu", CPU_FALLBACK["compute_type"], "Keine brauchbare Rechenart auf der Karte."


def gpu_name() -> str | None:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=10,
            **no_window_kwargs(),
        )
        if result.returncode == 0:
            return result.stdout.strip().splitlines()[0].strip() or None
    except Exception:
        return None
    return None


def load_model(model_name: str, device: str, compute_type: str, cache_dir: Path | None):
    from faster_whisper import WhisperModel

    kwargs: dict = {"device": device, "compute_type": compute_type}
    if device == "cpu":
        kwargs["cpu_threads"] = CPU_FALLBACK["cpu_threads"]
    if cache_dir is not None:
        kwargs["download_root"] = str(cache_dir)
    return WhisperModel(model_name, **kwargs)


def real_encode_check(model) -> None:
    """Ein echtes Encode, nicht bloß ein Modell-Laden.

    Nachgemessen: ``WhisperModel(..., device="cuda")`` meldet Erfolg auch
    dann, wenn cuBLAS fehlt. Der Fehler kommt erst beim ersten
    ``model.encode()`` — eine Prüfung, die nur das Modell konstruiert, ist
    wertlos. Das hier kostet rund eineinhalb Sekunden und erspart einen
    Fehlschlag nach halbem Lauf.
    """
    import numpy as np

    silence = np.zeros(16000 * 2, dtype="float32")
    segments, _ = model.transcribe(silence, language="de", beam_size=1)
    for _ in segments:
        break


# ─────────────────────────────────────────────── Ausgabeformate

def format_vtt_time(seconds: float) -> str:
    total = max(0.0, seconds)
    hours = int(total // 3600)
    minutes = int((total % 3600) // 60)
    secs = int(total % 60)
    millis = int(round((total - int(total)) * 1000))
    if millis == 1000:
        millis = 999
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def write_atomic(path: Path, content: str) -> None:
    """Erst daneben schreiben, dann umbenennen.

    So hinterlässt ein Absturz nie ein halbes Transkript in der Bibliothek,
    das später gültig aussieht.
    """
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def write_outputs(
    out_dir: Path,
    segments: list[dict],
    info: dict,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "version": 1,
        "model": info["model"],
        "device": info["device"],
        "language": info["language"],
        "language_probability": info.get("language_probability"),
        "duration_sec": info["duration_sec"],
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "segments": segments,
    }
    write_atomic(
        out_dir / "transcript.json",
        json.dumps(payload, ensure_ascii=False, indent=1),
    )

    lines = ["WEBVTT", ""]
    for index, segment in enumerate(segments, start=1):
        lines.append(str(index))
        lines.append(
            f"{format_vtt_time(segment['start'])} --> {format_vtt_time(segment['end'])}"
        )
        lines.append(segment["text"])
        lines.append("")
    write_atomic(out_dir / "transcript.vtt", "\n".join(lines))

    return {"json": "transcript.json", "vtt": "transcript.vtt"}


# ─────────────────────────────────────────────── Hauptlauf

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--media")
    parser.add_argument("--out-dir")
    parser.add_argument("--work-dir")
    parser.add_argument("--job-id", default="")
    parser.add_argument("--model", default="large-v3-turbo")
    parser.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    parser.add_argument("--compute-type", default="auto")
    parser.add_argument("--language", default="de")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    # Fachbegriffe kommen als Datei herein — nie als Argument. Das ist
    # gleichzeitig die Absicherung dagegen, dass Nutzereingaben auf eine
    # Kommandozeile geraten.
    parser.add_argument("--hotwords-file", default=None)
    parser.add_argument("--initial-prompt-file", default=None)
    parser.add_argument("--model-cache", default=None)
    parser.add_argument("--probe-only", action="store_true")
    parser.add_argument("--keep-wav", action="store_true")
    parser.add_argument("--no-segment-events", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cublas_dir = prepare_cuda_path()

    try:
        import ctranslate2
        import faster_whisper
    except ImportError as exc:
        fail(
            "internal",
            "faster-whisper ist in dieser Umgebung nicht installiert. "
            'Einrichten mit "npm run setup:python".',
            str(exc),
        )

    emit(
        "hello",
        pid=os.getpid(),
        python=sys.version.split()[0],
        faster_whisper=faster_whisper.__version__,
        ctranslate2=ctranslate2.__version__,
        cublas_dir=cublas_dir,
        job_id=args.job_id,
    )

    device, compute_type, fallback_reason = choose_device(
        args.device, args.compute_type
    )
    model_name = args.model
    if device == "cpu" and args.device == "auto":
        # Auf der CPU ist large-v3-turbo etwa Echtzeit — eine Stunde für eine
        # Stunde. Das ist kein brauchbarer Standard.
        model_name = CPU_FALLBACK["model"]

    cache_dir = Path(args.model_cache) if args.model_cache else None

    emit("stage", stage="download", message=f"Modell {model_name} wird geladen …")
    try:
        model = load_model(model_name, device, compute_type, cache_dir)
    except Exception as exc:
        if device == "cuda":
            log(f"Modell-Laden auf der Karte fehlgeschlagen: {exc}")
            emit(
                "warn",
                code="gpu_unavailable",
                message="Die Karte ließ sich nicht verwenden — der Lauf geht auf die CPU.",
            )
            device, compute_type = "cpu", CPU_FALLBACK["compute_type"]
            model_name = CPU_FALLBACK["model"]
            fallback_reason = str(exc)
            try:
                model = load_model(model_name, device, compute_type, cache_dir)
            except Exception as inner:
                fail("model_download_failed", "Das Modell konnte nicht geladen werden.", str(inner))
        else:
            fail("model_download_failed", "Das Modell konnte nicht geladen werden.", str(exc))

    # Echtes Encode, siehe real_encode_check().
    if device == "cuda":
        try:
            real_encode_check(model)
        except Exception as exc:
            log(f"Probelauf auf der Karte fehlgeschlagen: {exc}")
            emit(
                "warn",
                code="gpu_unavailable",
                message=(
                    "Die Karte rechnet nicht — meist fehlt cublas64_12.dll. "
                    "Der Lauf geht auf die CPU."
                ),
            )
            fallback_reason = str(exc)
            device, compute_type = "cpu", CPU_FALLBACK["compute_type"]
            model_name = CPU_FALLBACK["model"]
            model = load_model(model_name, device, compute_type, cache_dir)

    emit(
        "device",
        device=device,
        compute_type=compute_type,
        model=model_name,
        gpu=gpu_name() if device == "cuda" else None,
        fallback_reason=fallback_reason,
    )

    if args.probe_only:
        emit("done", probe=True, device=device, model=model_name)
        return

    if not args.media or not args.out_dir or not args.work_dir:
        fail("internal", "Es fehlen --media, --out-dir oder --work-dir.")

    media = Path(args.media)
    if not media.is_file():
        fail("internal", f"Die Datei {media} gibt es nicht.")

    out_dir = Path(args.out_dir)
    work_dir = Path(args.work_dir)

    media_info = probe_media(args.ffprobe, media)
    total = float(media_info["duration_sec"])
    emit("media", **media_info)
    if total <= 0:
        log("Warnung: keine Dauer ermittelbar — der Fortschritt bleibt grob.")

    wav = work_dir / "audio.wav"
    extract_audio(args.ffmpeg, media, wav, total)

    def read_text_file(where: str | None, label: str) -> str | None:
        if not where:
            return None
        try:
            text = Path(where).read_text(encoding="utf-8").strip()
            return text or None
        except OSError as exc:
            log(f"{label} nicht lesbar: {exc}")
            return None

    """
    Fachbegriffe gehen als `hotwords` hinein, nicht als `initial_prompt`.

    Nachgemessen an derselben Aufnahme:
      ohne alles          11 Segmente, 2,8 s Schnitt, aber "Eliös 3"
      initial_prompt       5 Segmente, 7,4 s Schnitt (längstes 18 s), "Elios 3"
      hotwords             7 Segmente, längstes 10,3 s, "Elios 3"

    Der Anfangs-Prompt wirkt als Kontext und lässt das Modell deutlich
    längere Blöcke bilden — bei "Klick auf die Transkriptzeile springt zur
    Stelle" landet man dann bis zu achtzehn Sekunden vom gesuchten Satz
    entfernt. `hotwords` hebt die Begriffe hervor, ohne die Segmentierung
    so stark zu verändern.

    `--initial-prompt-file` bleibt für den Sonderfall, dass jemand
    tatsächlich Kontext vorgeben will.
    """
    hotwords = read_text_file(args.hotwords_file, "Fachbegriffe")
    initial_prompt = read_text_file(args.initial_prompt_file, "Anfangs-Prompt")

    emit("stage", stage="transcribe", message="Transkription läuft …")
    started = time.monotonic()

    try:
        segments_iter, transcribe_info = model.transcribe(
            str(wav),
            language=args.language or None,
            beam_size=args.beam_size,
            # Wichtigste Verteidigung gegen erfundenen Text in Vortragspausen.
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            # Ohne das vergiftet eine einzige Fehltranskription den Rest
            # eines 90-Minuten-Laufs, weil das Modell sich an ihr festhält.
            condition_on_previous_text=False,
            hotwords=hotwords,
            initial_prompt=initial_prompt,
            word_timestamps=False,
        )
    except Exception as exc:
        fail("internal", "Die Transkription ließ sich nicht starten.", str(exc))

    if total <= 0:
        total = float(getattr(transcribe_info, "duration", 0) or 0)

    segments: list[dict] = []
    last_progress = 0.0
    last_ratio = 0.0

    def send_progress(done_sec: float, stalled: float = 0.0) -> None:
        nonlocal last_ratio
        ratio = min(1.0, max(last_ratio, done_sec / total)) if total > 0 else 0.0
        last_ratio = ratio
        elapsed = time.monotonic() - started
        speed = (done_sec / elapsed) if elapsed > 0 else 0.0
        remaining = (total - done_sec) / speed if speed > 0 and total > 0 else None
        emit(
            "progress",
            stage="transcribe",
            done_sec=round(done_sec, 2),
            total_sec=round(total, 2),
            ratio=round(ratio, 4),
            eta_sec=round(remaining) if remaining is not None else None,
            speed=round(speed, 2),
            stall_sec=round(stalled, 1),
        )

    try:
        for index, segment in enumerate(segments_iter):
            text = (segment.text or "").strip()
            start = float(segment.start or 0.0)
            end = float(segment.end or start)
            if text:
                segments.append(
                    {"start": round(start, 2), "end": round(end, 2), "text": text}
                )
                if not args.no_segment_events:
                    emit("segment", i=index, start=round(start, 2), end=round(end, 2), text=text)

            now = time.monotonic()
            if now - last_progress >= 1.0:
                last_progress = now
                send_progress(end)
    except KeyboardInterrupt:
        fail("canceled", "Abgebrochen.")
    except Exception as exc:
        message = str(exc)
        if "cublas" in message.lower() or "cuda" in message.lower():
            fail(
                "gpu_lost",
                "Die Grafikkarte hat den Lauf abgebrochen. Ein neuer Versuch "
                "läuft auf der CPU.",
                message,
            )
        fail("internal", "Die Transkription ist fehlgeschlagen.", message)

    if not segments:
        fail(
            "internal",
            "Es wurde kein Text erkannt. Ist auf der Tonspur überhaupt "
            "gesprochen worden?",
        )

    send_progress(total if total > 0 else segments[-1]["end"])

    emit("stage", stage="write", message="Transkript wird geschrieben …")
    files = write_outputs(
        out_dir,
        segments,
        {
            "model": model_name,
            "device": device,
            "language": getattr(transcribe_info, "language", args.language),
            "language_probability": getattr(
                transcribe_info, "language_probability", None
            ),
            "duration_sec": round(total, 2) if total > 0 else None,
        },
    )

    if not args.keep_wav:
        try:
            wav.unlink(missing_ok=True)
        except OSError:
            pass

    emit(
        "done",
        language=getattr(transcribe_info, "language", args.language),
        language_probability=getattr(transcribe_info, "language_probability", None),
        duration_sec=round(total, 2) if total > 0 else None,
        segments=len(segments),
        files=files,
        wall_sec=round(time.monotonic() - started, 1),
        device=device,
        model=model_name,
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except KeyboardInterrupt:
        emit("error", code="canceled", message="Abgebrochen.")
        sys.exit(130)
    except Exception as exc:  # pragma: no cover
        emit("error", code="internal", message="Unerwarteter Fehler.", detail=str(exc))
        sys.exit(1)
