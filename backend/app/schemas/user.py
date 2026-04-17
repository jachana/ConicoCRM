from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str  # admin | subadmin | vendedor


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None
