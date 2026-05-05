from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import (
    consume_recovery_code,
    create_access_token,
    create_refresh_token,
    create_twofa_ticket,
    decode_token,
    decode_twofa_ticket,
    generate_password_reset_token,
    generate_recovery_codes,
    generate_totp_secret,
    get_password_hash,
    hash_password_reset_token,
    hash_recovery_code,
    qr_png_base64,
    totp_provisioning_uri,
    verify_password,
    verify_totp,
)
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    Token,
    TwoFAChallenge,
    TwoFADisable,
    TwoFAEnrollResult,
    TwoFARegenerateCodes,
    TwoFASetupOut,
    TwoFAStatusOut,
    TwoFAVerifyEnroll,
    TwoFAVerifyLogin,
)
from app.schemas.user import UserOut
from app.services.email import EmailNotConfiguredError, enviar_recordatorio

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access" or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter_by(email=payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _issue_tokens(user: User) -> Token:
    claims = {"sub": user.email, "empresa_id": str(user.empresa_id) if user.empresa_id else None}
    return Token(
        access_token=create_access_token(claims),
        refresh_token=create_refresh_token(claims),
    )


@router.post("/login", response_model=Token | TwoFAChallenge)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=form.username.lower().strip()).first()
    if not user or not verify_password(form.password, user.hashed_password) or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.totp_enabled:
        return TwoFAChallenge(ticket=create_twofa_ticket(user.email))
    return _issue_tokens(user)


@router.post("/login/2fa", response_model=Token)
def login_2fa(body: TwoFAVerifyLogin, db: Session = Depends(get_db)):
    email = decode_twofa_ticket(body.ticket)
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ticket inválido o expirado")
    user = db.query(User).filter_by(email=email).first()
    if not user or not user.is_active or not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no válido")

    code = body.code.strip()
    if verify_totp(user.totp_secret, code):
        return _issue_tokens(user)

    matched, remaining = consume_recovery_code(user.totp_recovery_codes, code)
    if matched:
        user.totp_recovery_codes = remaining
        db.commit()
        return _issue_tokens(user)

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Código inválido")


@router.post("/refresh", response_model=Token)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh" or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = db.query(User).filter_by(email=payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return _issue_tokens(user)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# --- 2FA management (requires logged-in user) -------------------------

@router.get("/2fa/status", response_model=TwoFAStatusOut)
def twofa_status(current_user: User = Depends(get_current_user)):
    return TwoFAStatusOut(enabled=bool(current_user.totp_enabled))


@router.post("/2fa/setup", response_model=TwoFASetupOut)
def twofa_setup(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA ya está activo")
    secret = generate_totp_secret()
    current_user.totp_secret = secret
    db.commit()
    uri = totp_provisioning_uri(secret, current_user.email)
    return TwoFASetupOut(secret=secret, provisioning_uri=uri, qr_png_base64=qr_png_base64(uri))


@router.post("/2fa/verify", response_model=TwoFAEnrollResult)
def twofa_verify_enroll(
    body: TwoFAVerifyEnroll,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA ya está activo")
    if not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inicia el setup de 2FA primero")
    if not verify_totp(current_user.totp_secret, body.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Código inválido")
    plain_codes = generate_recovery_codes()
    current_user.totp_recovery_codes = [hash_recovery_code(c) for c in plain_codes]
    current_user.totp_enabled = True
    db.commit()
    return TwoFAEnrollResult(recovery_codes=plain_codes)


@router.post("/2fa/disable", status_code=status.HTTP_204_NO_CONTENT)
def twofa_disable(
    body: TwoFADisable,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.totp_enabled or not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA no está activo")
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contraseña incorrecta")

    code = body.code.strip()
    if not verify_totp(current_user.totp_secret, code):
        matched, remaining = consume_recovery_code(current_user.totp_recovery_codes, code)
        if not matched:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Código inválido")
        current_user.totp_recovery_codes = remaining
    current_user.totp_enabled = False
    current_user.totp_secret = None
    current_user.totp_recovery_codes = None
    db.commit()


@router.post("/2fa/recovery-codes/regenerate", response_model=TwoFAEnrollResult)
def twofa_regenerate_codes(
    body: TwoFARegenerateCodes,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.totp_enabled or not current_user.totp_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA no está activo")
    if not verify_totp(current_user.totp_secret, body.code.strip()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Código inválido")
    plain_codes = generate_recovery_codes()
    current_user.totp_recovery_codes = [hash_recovery_code(c) for c in plain_codes]
    db.commit()
    return TwoFAEnrollResult(recovery_codes=plain_codes)


# --- Password reset ----------------------------------------------------

@router.post("/password-reset/request", status_code=status.HTTP_204_NO_CONTENT)
def password_reset_request(body: PasswordResetRequest, db: Session = Depends(get_db)):
    """Always returns 204 — does not reveal whether the email exists."""
    user = db.query(User).filter_by(email=body.email.lower().strip()).first()
    if not user or not user.is_active:
        return
    token = generate_password_reset_token()
    user.password_reset_token_hash = hash_password_reset_token(token)
    user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.password_reset_expire_minutes
    )
    db.commit()

    reset_url = f"{settings.password_reset_url_base.rstrip('/')}/{token}"
    body_text = (
        f"Hola {user.name},\n\n"
        f"Recibimos una solicitud para restablecer tu contraseña en Conico.\n\n"
        f"Abre este enlace para crear una contraseña nueva (válido por "
        f"{settings.password_reset_expire_minutes} minutos):\n{reset_url}\n\n"
        f"Si no solicitaste este cambio, ignora este correo.\n\n"
        f"Saludos,\nConico"
    )
    try:
        enviar_recordatorio(user.email, "Restablecer contraseña — Conico", body_text)
    except (EmailNotConfiguredError, Exception):
        # Do not leak email-config errors to the caller; reset_url is in DB and logs.
        return


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def password_reset_confirm(body: PasswordResetConfirm, db: Session = Depends(get_db)):
    token_hash = hash_password_reset_token(body.token)
    user = db.query(User).filter_by(password_reset_token_hash=token_hash).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token inválido")

    expires = user.password_reset_expires_at
    if expires is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token inválido")
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expirado")

    user.hashed_password = get_password_hash(body.new_password)
    user.password_reset_token_hash = None
    user.password_reset_expires_at = None
    db.commit()
