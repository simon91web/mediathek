"""Kindprozesse unter Windows sauber führen.

Zwei Dinge: kein aufblitzendes Konsolenfenster, und langlebige ffmpeg-Aufrufe
an ein "kill-on-close"-Job-Objekt heften, damit sie beim Beenden dieses
Prozesses nicht als Waise weiterlaufen.

Übernommen aus ``ui_companion/nautiq/src/logic/nautiq_subprocess.py`` — dort
ist es an genau diesem Fehlerbild debuggt: ffmpeg überlebte die geschlossene
Konsole und blockierte gigabyteweise Speicher für einen längst abgebrochenen
Render.

Das löst genau den Fall, den die Node-Seite nicht sauber lösen kann: stirbt
python.exe, stirbt sein ffmpeg.exe mit — ohne dass jemand eine gespeicherte
Prozesskennung töten müsste.
"""

from __future__ import annotations

import os
import subprocess
import sys


def no_window_kwargs() -> dict:
    """Argumente für Popen, die auf Windows das Konsolenfenster unterdrücken."""
    # Auf Nicht-Windows leer; beim **-Auspacken schlicht wirkungslos.
    if os.name != "nt":
        return {}
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return {
        "creationflags": subprocess.CREATE_NO_WINDOW,
        "startupinfo": startupinfo,
    }


_kill_on_close_job = None  # Win32-HANDLE oder None


def _ensure_kill_on_close_job():
    """Erzeugt das Job-Objekt beim ersten Aufruf. Auf Nicht-Windows ``None``.

    Ein einziges Job-Objekt mit JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; alle
    Kinder werden dort hineingehängt. Stirbt dieser Prozess, schließt Windows
    den Handle, das Flag feuert, und die zugewiesenen Prozesse werden hart
    beendet.
    """
    global _kill_on_close_job
    if os.name != "nt":
        return None
    if _kill_on_close_job is not None:
        return _kill_on_close_job

    try:
        import ctypes
        import ctypes.wintypes as wt

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateJobObjectW.restype = wt.HANDLE
        kernel32.SetInformationJobObject.argtypes = [
            wt.HANDLE,
            ctypes.c_int,
            ctypes.c_void_p,
            wt.DWORD,
        ]
        kernel32.SetInformationJobObject.restype = wt.BOOL

        job = kernel32.CreateJobObjectW(None, None)
        if not job:
            return None

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [
                ("ReadOperationCount", ctypes.c_ulonglong),
                ("WriteOperationCount", ctypes.c_ulonglong),
                ("OtherOperationCount", ctypes.c_ulonglong),
                ("ReadTransferCount", ctypes.c_ulonglong),
                ("WriteTransferCount", ctypes.c_ulonglong),
                ("OtherTransferCount", ctypes.c_ulonglong),
            ]

        class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", ctypes.c_int64),
                ("PerJobUserTimeLimit", ctypes.c_int64),
                ("LimitFlags", wt.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", wt.DWORD),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", wt.DWORD),
                ("SchedulingClass", wt.DWORD),
            ]

        class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
                ("IoInfo", IO_COUNTERS),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t),
            ]

        info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        info.BasicLimitInformation.LimitFlags = 0x00002000
        # JobObjectExtendedLimitInformation = 9
        ok = kernel32.SetInformationJobObject(
            job, 9, ctypes.byref(info), ctypes.sizeof(info)
        )
        if not ok:
            kernel32.CloseHandle(job)
            return None

        _kill_on_close_job = job
        return job
    except Exception as exc:  # pragma: no cover - nur auf Windows relevant
        print(f"[procutil] Job-Objekt nicht verfügbar: {exc}", file=sys.stderr)
        return None


def attach_to_kill_job(pid: int) -> bool:
    """Hängt den Prozess an das Job-Objekt. ``True`` bei Erfolg."""
    if os.name != "nt":
        return False
    job = _ensure_kill_on_close_job()
    if not job:
        return False
    try:
        import ctypes
        import ctypes.wintypes as wt

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
        kernel32.OpenProcess.restype = wt.HANDLE
        kernel32.AssignProcessToJobObject.argtypes = [wt.HANDLE, wt.HANDLE]
        kernel32.AssignProcessToJobObject.restype = wt.BOOL

        PROCESS_SET_QUOTA = 0x0100
        PROCESS_TERMINATE = 0x0001
        handle = kernel32.OpenProcess(
            PROCESS_SET_QUOTA | PROCESS_TERMINATE, False, int(pid)
        )
        if not handle:
            return False
        ok = kernel32.AssignProcessToJobObject(job, handle)
        kernel32.CloseHandle(handle)
        return bool(ok)
    except Exception:  # pragma: no cover
        return False


def popen_managed(*args, **kwargs):
    """Wie ``subprocess.Popen``, hängt den Prozess aber sofort an das Job-Objekt."""
    process = subprocess.Popen(*args, **kwargs)
    try:
        attach_to_kill_job(process.pid)
    except Exception:
        pass
    return process
