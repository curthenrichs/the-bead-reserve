"""Server lifecycle without llama.cpp: health-poll against a stdlib HTTP
stub, VmHWM parsing from text, spawn errors from a bogus binary."""

import http.server
import subprocess
import threading

import pytest

from beadz_cro_bench import server as server_mod
from beadz_cro_bench.server import (ServerError, parse_vmhwm, peak_rss_kb,
                                    start_server, wait_healthy)


class _Health(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/health" else 404)
        self.end_headers()

    def log_message(self, *a):
        pass


@pytest.fixture()
def health_server():
    httpd = http.server.HTTPServer(("127.0.0.1", 0), _Health)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def test_wait_healthy_returns_elapsed(health_server):
    assert 0 <= wait_healthy(health_server, timeout=5.0) < 5.0


def test_wait_healthy_timeout():
    with pytest.raises(ServerError, match="not healthy"):
        wait_healthy("http://127.0.0.1:1", timeout=0.5)


def test_start_server_missing_model(tmp_path):
    with pytest.raises(ServerError, match="fetch-models"):
        start_server("llama-server", tmp_path / "no.gguf", tmp_path / "no-mm.gguf", 8091)


def test_start_server_bad_binary(tmp_path):
    model = tmp_path / "m.gguf"
    mmproj = tmp_path / "mm.gguf"
    model.write_bytes(b"x")
    mmproj.write_bytes(b"x")
    with pytest.raises(ServerError, match="cannot launch"):
        start_server(str(tmp_path / "no-such-binary"), model, mmproj, 8091)


def test_parse_vmhwm():
    text = "Name:\tllama-server\nVmPeak:\t 999 kB\nVmHWM:\t  612344 kB\n"
    assert parse_vmhwm(text) == 612344


def test_parse_vmhwm_absent():
    assert parse_vmhwm("Name:\tx\n") is None


def test_peak_rss_kb_bad_pid_is_none():
    assert peak_rss_kb(2 ** 22 + 12345) is None


class _FakeProc:
    """Stands in for subprocess.Popen: never actually spawns anything,
    just records whether teardown reached it."""

    def __init__(self):
        self.pid = 99999
        self.returncode = None
        self.killed = False
        self.waited = False

    def poll(self):
        return None

    def kill(self):
        self.killed = True

    def wait(self, timeout=None):
        self.waited = True


def test_start_server_kills_proc_on_interrupt_during_load(monkeypatch, tmp_path):
    model = tmp_path / "m.gguf"
    mmproj = tmp_path / "mm.gguf"
    model.write_bytes(b"x")
    mmproj.write_bytes(b"x")

    fake_proc = _FakeProc()
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **kw: fake_proc)

    def _raise_kbi(*a, **kw):
        raise KeyboardInterrupt

    monkeypatch.setattr(server_mod, "wait_healthy", _raise_kbi)

    with pytest.raises(KeyboardInterrupt):
        start_server("llama-server", model, mmproj, 8091)

    assert fake_proc.killed
    assert fake_proc.waited
