from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# 2FA flow ---------------------------------------------------------------

class TwoFAChallenge(BaseModel):
    """Returned by /auth/login when the user has TOTP enabled.

    The frontend must POST the ticket plus the 6-digit code (or a recovery
    code) to /auth/login/2fa to receive real access/refresh tokens.
    """
    twofa_required: bool = True
    ticket: str


class TwoFAVerifyLogin(BaseModel):
    ticket: str
    code: str = Field(..., min_length=6, max_length=20)


class TwoFASetupOut(BaseModel):
    secret: str
    provisioning_uri: str
    qr_png_base64: str


class TwoFAVerifyEnroll(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)


class TwoFAEnrollResult(BaseModel):
    recovery_codes: list[str]


class TwoFADisable(BaseModel):
    password: str
    code: str = Field(..., min_length=6, max_length=20)


class TwoFARegenerateCodes(BaseModel):
    code: str = Field(..., min_length=6, max_length=20)


class TwoFAStatusOut(BaseModel):
    enabled: bool


# Password reset ---------------------------------------------------------

class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(..., min_length=20)
    new_password: str = Field(..., min_length=8, max_length=128)
