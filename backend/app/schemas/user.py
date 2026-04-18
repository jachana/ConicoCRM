from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr

RoleType = Literal["admin", "subadmin", "vendedor"]


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
    role: RoleType


class UserUpdate(BaseModel):
    name: str | None = None
    role: RoleType | None = None
    is_active: bool | None = None
    password: str | None = None
