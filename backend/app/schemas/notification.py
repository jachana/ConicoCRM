from datetime import datetime
from typing import Any

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    tipo: str
    titulo: str
    cuerpo: str | None
    payload: dict[str, Any]
    leida_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    total: int
    unread: int


class UnreadCountOut(BaseModel):
    unread: int


class MarkReadOut(BaseModel):
    marked: int
