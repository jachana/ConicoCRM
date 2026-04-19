# backend/app/api/dashboard.py
import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.dashboard_layout import DashboardLayout
from app.models.user import User
from app.schemas.dashboard_layout import (
    DashboardLayoutOut,
    LayoutPayload,
)

router = APIRouter()


def _get_layout_for_role(db: Session, role: str) -> DashboardLayout | None:
    layout = db.query(DashboardLayout).filter_by(role=role).first()
    if layout is None and role == "subadmin":
        layout = db.query(DashboardLayout).filter_by(role="admin").first()
    return layout


def _layout_to_out(role: str, layout: DashboardLayout | None) -> DashboardLayoutOut:
    if layout is None:
        return DashboardLayoutOut(role=role, layout=LayoutPayload(widgets=[]))
    payload = LayoutPayload(**json.loads(layout.layout_json))
    return DashboardLayoutOut(role=role, layout=payload, updated_at=layout.updated_at)


@router.get("/layout/{role}", response_model=DashboardLayoutOut)
def get_layout(
    role: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    layout = _get_layout_for_role(db, role)
    return _layout_to_out(role, layout)


@router.put("/layout/{role}", response_model=DashboardLayoutOut)
def save_layout(
    role: str,
    body: LayoutPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede editar el layout")
    layout = db.query(DashboardLayout).filter_by(role=role).first()
    if layout is None:
        layout = DashboardLayout(role=role)
        db.add(layout)
    layout.layout_json = body.model_dump_json()
    layout.updated_by = current_user.id
    layout.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(layout)
    return _layout_to_out(role, layout)
