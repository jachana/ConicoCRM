import base64
import hashlib
import hmac
import io
import secrets
from datetime import datetime, timedelta, timezone

import pyotp
import segno
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({**data, "exp": expire, "type": "access"}, settings.secret_key, algorithm="HS256")


def create_refresh_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    return jwt.encode({**data, "exp": expire, "type": "refresh"}, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except JWTError:
        return None


# --- 2FA ticket (short-lived JWT for the password→TOTP step) -----------

def create_twofa_ticket(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(seconds=settings.twofa_ticket_expire_seconds)
    return jwt.encode(
        {"sub": email, "exp": expire, "type": "twofa_ticket"},
        settings.secret_key,
        algorithm="HS256",
    )


def decode_twofa_ticket(token: str) -> str | None:
    payload = decode_token(token)
    if not payload or payload.get("type") != "twofa_ticket":
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


# --- TOTP --------------------------------------------------------------

def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, account_email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account_email, issuer_name=settings.totp_issuer)


def qr_png_base64(uri: str) -> str:
    buf = io.BytesIO()
    segno.make(uri, error="m").save(buf, kind="png", scale=5)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    code = code.replace(" ", "").strip()
    if not code.isdigit() or len(code) != 6:
        return False
    return pyotp.TOTP(secret).verify(code, valid_window=1)


# --- Recovery codes ----------------------------------------------------

def generate_recovery_codes(n: int = 10) -> list[str]:
    """Plaintext codes returned to the user once. Only hashes are stored."""
    return [
        f"{secrets.token_hex(2)}-{secrets.token_hex(2)}-{secrets.token_hex(2)}".lower()
        for _ in range(n)
    ]


def hash_recovery_code(code: str) -> str:
    norm = code.replace("-", "").replace(" ", "").lower()
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def consume_recovery_code(stored: list[str] | None, candidate: str) -> tuple[bool, list[str]]:
    """Returns (matched, new_list_with_used_code_removed)."""
    if not stored:
        return False, stored or []
    h = hash_recovery_code(candidate)
    for i, s in enumerate(stored):
        if hmac.compare_digest(s, h):
            return True, [c for j, c in enumerate(stored) if j != i]
    return False, stored


# --- Password reset tokens --------------------------------------------

def generate_password_reset_token() -> str:
    return secrets.token_urlsafe(32)


def hash_password_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
