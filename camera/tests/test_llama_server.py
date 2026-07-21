import http.server
import threading

import pytest

from beadz_camera.llama_server import ServerError, start_server, wait_healthy


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
    with pytest.raises(ServerError, match="model file missing"):
        start_server("llama-server", tmp_path / "no.gguf",
                     tmp_path / "no-mm.gguf", 8091, ctx_size=2048)


def test_start_server_bad_binary(tmp_path):
    (tmp_path / "m.gguf").write_bytes(b"x")
    (tmp_path / "mm.gguf").write_bytes(b"x")
    with pytest.raises(ServerError, match="cannot launch"):
        start_server(str(tmp_path / "nope-bin"), tmp_path / "m.gguf",
                     tmp_path / "mm.gguf", 8091, ctx_size=2048)
