"""SHA-256 + Ed25519 over the digest. The signature covers the raw 32-byte
digest of the final (cropped, EXIF-free) JPEG bytes — the exact bytes served
publicly, so anyone can re-hash and verify."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey


def generate_keypair(key_path: Path) -> str:
    if key_path.exists():
        raise FileExistsError(f"refusing to overwrite existing key: {key_path}")
    key_path.parent.mkdir(parents=True, exist_ok=True)
    key = SigningKey.generate()
    key_path.write_text(key.encode().hex() + "\n")
    os.chmod(key_path, 0o600)
    pub_hex = key.verify_key.encode().hex()
    key_path.with_suffix(".pub").write_text(pub_hex + "\n")
    return pub_hex


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
