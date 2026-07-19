"""SHA-256 + Ed25519 over the digest. The signature covers the raw 32-byte
digest of the final (cropped, EXIF-free) JPEG bytes — the exact bytes served
publicly, so anyone can re-hash and verify."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey


def export_pubkey(key_path: Path) -> str:
    """(Re)derive the public key from an existing private key and (re)write the
    .pub sidecar. Idempotent — the recovery path when a .pub was lost."""
    pub_hex = load_signing_key(key_path).verify_key.encode().hex()
    key_path.with_suffix(".pub").write_text(pub_hex + "\n")
    return pub_hex


def generate_keypair(key_path: Path) -> str:
    if key_path.exists():
        raise FileExistsError(f"refusing to overwrite existing key: {key_path}")
    key_path.parent.mkdir(parents=True, exist_ok=True)
    key = SigningKey.generate()
    fd = os.open(key_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(key.encode().hex() + "\n")
    return export_pubkey(key_path)


def load_signing_key(key_path: Path) -> SigningKey:
    return SigningKey(bytes.fromhex(key_path.read_text().strip()))


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sign_hash(key: SigningKey, sha256_hex: str) -> str:
    return key.sign(bytes.fromhex(sha256_hex)).signature.hex()


def verify(pub_hex: str, sha256_hex: str, sig_hex: str) -> bool:
    try:
        VerifyKey(bytes.fromhex(pub_hex)).verify(
            bytes.fromhex(sha256_hex), bytes.fromhex(sig_hex)
        )
        return True
    except BadSignatureError:
        return False
