"""download_verified contract with a faked HTTP layer + pinned-constant honesty."""

import hashlib

import pytest
import responses

from beadz_cro_bench.fetch import MODELS, FetchError, download_verified

URL = "https://example.test/m.gguf"
DATA = b"gguf-bytes"
SHA = hashlib.sha256(DATA).hexdigest()


@responses.activate
def test_download_and_verify(tmp_path):
    responses.add(responses.GET, URL, body=DATA)
    dest = tmp_path / "m.gguf"
    assert download_verified(URL, dest, SHA) == SHA
    assert dest.read_bytes() == DATA
    assert not dest.with_suffix(".gguf.part").exists()


@responses.activate
def test_mismatch_removes_partial(tmp_path):
    responses.add(responses.GET, URL, body=b"evil-bytes")
    dest = tmp_path / "m.gguf"
    with pytest.raises(FetchError, match="sha256 mismatch"):
        download_verified(URL, dest, SHA)
    assert not dest.exists()
    assert not dest.with_suffix(".gguf.part").exists()


@responses.activate
def test_existing_valid_file_skips_download(tmp_path):
    dest = tmp_path / "m.gguf"
    dest.write_bytes(DATA)
    assert download_verified(URL, dest, SHA) == SHA
    assert len(responses.calls) == 0


@responses.activate
def test_http_error_raises(tmp_path):
    responses.add(responses.GET, URL, status=404)
    with pytest.raises(FetchError, match="HTTP 404"):
        download_verified(URL, tmp_path / "m.gguf", SHA)


@responses.activate
def test_unpinned_returns_digest(tmp_path):
    responses.add(responses.GET, URL, body=DATA)
    assert download_verified(URL, tmp_path / "m.gguf", None) == SHA


def test_shipped_hashes_are_pinned():
    # The committed constant must never carry unpinned (None) hashes.
    for quant, files in MODELS.items():
        for filename, sha in files:
            assert sha and len(sha) == 64, f"unpinned hash for {quant}/{filename}"
