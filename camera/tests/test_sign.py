import os
import stat

import pytest

from beadz_camera.sign import (
    generate_keypair,
    load_signing_key,
    sha256_file,
    sign_hash,
    verify,
)


@pytest.fixture()
def key_path(tmp_path):
    return tmp_path / "keys" / "ed25519.key"


def test_keygen_roundtrip(key_path, tmp_path):
    pub = generate_keypair(key_path)
    f = tmp_path / "frame.jpg"
    f.write_bytes(b"not really a jpeg")
    digest = sha256_file(f)
    sig = sign_hash(load_signing_key(key_path), digest)
    assert verify(pub, digest, sig)


def test_verify_rejects_tampered_hash(key_path, tmp_path):
    pub = generate_keypair(key_path)
    f = tmp_path / "frame.jpg"
    f.write_bytes(b"original bytes")
    sig = sign_hash(load_signing_key(key_path), sha256_file(f))
    f.write_bytes(b"tampered bytes")
    assert not verify(pub, sha256_file(f), sig)


def test_keygen_refuses_overwrite(key_path):
    generate_keypair(key_path)
    with pytest.raises(FileExistsError):
        generate_keypair(key_path)


def test_pub_file_written(key_path):
    pub = generate_keypair(key_path)
    assert key_path.with_suffix(".pub").read_text().strip() == pub


@pytest.mark.skipif(os.name == "nt", reason="POSIX permissions")
def test_private_key_is_0600(key_path):
    generate_keypair(key_path)
    assert stat.S_IMODE(key_path.stat().st_mode) == 0o600
