from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    user_name: str | None = None
    user_email: str | None = None
    action: str
    entity_type: str
    entity_id: str
    diff_json: dict[str, Any] | None = None
    ip: str | None = None
    user_agent: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogPage(BaseModel):
    items: list[AuditLogOut]
    total: int
    limit: int
    offset: int
