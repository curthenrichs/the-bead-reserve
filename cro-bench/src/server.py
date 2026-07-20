"""llama-server lifecycle: spawn, health-poll, peak-RSS, kill.

Spawn-fresh-then-kill mirrors the intended production shape — no
resident server on a 1 GB Pi — so model_load_s (spawn -> /health OK)
is exactly the hourly bring-up cost the Pi runs exist to measure.
Peak RSS comes from /proc/<pid>/status VmHWM and must be read BEFORE
the process is stopped (Linux only; None elsewhere)."""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

import requests


class ServerError(RuntimeError):
    pass


def wait_healthy(url: str, timeout: float,
                 proc: subprocess.Popen | None = None) -> float:
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if proc is not None and proc.poll() is not None:
            raise ServerError(
                f"llama-server exited early (code {proc.returncode}) — see llama-server.log")
        try:
            if requests.get(f"{url}/health", timeout=2).status_code == 200:
                return time.monotonic() - t0
        except requests.RequestException:
            pass
        time.sleep(0.5)
    raise ServerError(f"server at {url} not healthy after {timeout}s")


def start_server(server_bin: str, model: Path, mmproj: Path, port: int,
                 log_path: Path | None = None,
                 load_timeout: float = 300.0) -> tuple[subprocess.Popen, str, float]:
    for p in (model, mmproj):
        if not p.is_file():
            raise ServerError(
                f"model file missing: {p} (run: beadz-cro-bench fetch-models)")
    argv = [server_bin, "-m", str(model), "--mmproj", str(mmproj),
            "--host", "127.0.0.1", "--port", str(port)]
    log = log_path.open("ab") if log_path else subprocess.DEVNULL
    try:
        proc = subprocess.Popen(argv, stdout=log, stderr=log)
    except OSError as exc:
        raise ServerError(f"cannot launch {server_bin}: {exc}") from exc
    finally:
        if log_path:
            log.close()
    url = f"http://127.0.0.1:{port}"
    try:
        load_s = wait_healthy(url, load_timeout, proc)
    except ServerError:
        proc.kill()
        proc.wait()
        raise
    return proc, url, round(load_s, 2)


def parse_vmhwm(status_text: str) -> int | None:
    for line in status_text.splitlines():
        if line.startswith("VmHWM:"):
            parts = line.split()
            if len(parts) >= 2 and parts[1].isdigit():
                return int(parts[1])
    return None


def peak_rss_kb(pid: int) -> int | None:
    try:
        return parse_vmhwm(Path(f"/proc/{pid}/status").read_text())
    except OSError:
        return None


def stop_server(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
