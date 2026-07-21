"""llama-server lifecycle for the on-device CRO: spawn, health-poll, kill.

Spawn-fresh-then-kill per capture (no resident server on a 1 GB Pi). Ported
from cro-bench/src/server.py, adding --ctx-size and an LD_LIBRARY_PATH hint so
a source-built binary finds its sibling .so files. Teardown is orphan-safe:
any exception during the health wait still reaps the child (a stuck server
must never outlive the capture that spawned it)."""

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
                f"llama-server exited early (code {proc.returncode})")
        try:
            if requests.get(f"{url}/health", timeout=2).status_code == 200:
                return time.monotonic() - t0
        except requests.RequestException:
            pass
        time.sleep(0.5)
    raise ServerError(f"server at {url} not healthy after {timeout}s")


def start_server(server_bin: str, model: Path, mmproj: Path, port: int,
                 ctx_size: int, log_path: Path | None = None,
                 load_timeout: float = 180.0) -> tuple[subprocess.Popen, str]:
    for label, p in (("model", model), ("mmproj", mmproj)):
        if not Path(p).is_file():
            raise ServerError(f"{label} file missing: {p}")
    argv = [str(server_bin), "-m", str(model), "--mmproj", str(mmproj),
            "--host", "127.0.0.1", "--port", str(port),
            "--ctx-size", str(ctx_size)]
    import os
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = str(Path(server_bin).parent) + \
        (":" + env["LD_LIBRARY_PATH"] if env.get("LD_LIBRARY_PATH") else "")
    log = open(log_path, "ab") if log_path else subprocess.DEVNULL
    try:
        proc = subprocess.Popen(argv, stdout=log, stderr=log, env=env)
    except OSError as exc:
        raise ServerError(f"cannot launch {server_bin}: {exc}") from exc
    finally:
        if log_path:
            log.close()
    url = f"http://127.0.0.1:{port}"
    try:
        wait_healthy(url, load_timeout, proc)
    except BaseException:
        proc.kill()
        proc.wait()
        raise
    return proc, url


def stop_server(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
