"""Password hashing (Argon2id) and random tokens stored only as SHA-256 hashes."""

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

password_hasher = PasswordHasher()  # Argon2id with the library's recommended cost

_dummy_hash: str | None = None


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def burn_password_check(password: str) -> None:
    """Spends the time of a real check, so an unknown email answers as slowly as a known one."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password("not-a-real-password")
    verify_password(_dummy_hash, password)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
