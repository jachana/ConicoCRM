"""Admin + user endpoints for per-empresa module management (P1.7)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.config import require_admin
from app.core.modulos import OPTIONAL_MODULES
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.empresa import Empresa
from app.models.user import User
from app.services.modulo_calculator import (
    ModuloValidationError,
    compute_cascade,
    compute_effective_modulos,
    validate_toggle,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ModuloRegistryEntry(BaseModel):
    slug: str
    label: str
    categoria: str
    requires: list[str]
    dependents: list[str]


class EmpresaModulosResponse(BaseModel):
    stored: dict[str, bool]
    effective: dict[str, bool]
    registry: list[ModuloRegistryEntry]


class EmpresaModulosUpdate(BaseModel):
    modulos: dict[str, bool]


class MeModulosResponse(BaseModel):
    effective: dict[str, bool]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_empresa_or_404(db: Session, empresa_id: int) -> Empresa:
    empresa = db.get(Empresa, empresa_id)
    if empresa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return empresa


def _build_registry() -> list[ModuloRegistryEntry]:
    return [
        ModuloRegistryEntry(
            slug=slug,
            label=spec.label,
            categoria=spec.categoria,
            requires=spec.requires,
            dependents=spec.dependents,
        )
        for slug, spec in OPTIONAL_MODULES.items()
    ]


# ---------------------------------------------------------------------------
# GET /empresas/{empresa_id}/modulos  (admin)
# ---------------------------------------------------------------------------

@router.get("/empresas/{empresa_id}/modulos", response_model=EmpresaModulosResponse)
def get_empresa_modulos(
    empresa_id: int,
    perms: tuple[User, Session] = Depends(require_admin),
) -> Any:
    _, db = perms
    empresa = _get_empresa_or_404(db, empresa_id)
    stored: dict[str, bool] = empresa.modulos_enabled or {}
    effective = compute_effective_modulos(stored)
    return EmpresaModulosResponse(
        stored=stored,
        effective=effective,
        registry=_build_registry(),
    )


# ---------------------------------------------------------------------------
# PATCH /empresas/{empresa_id}/modulos  (admin)
# ---------------------------------------------------------------------------

@router.patch("/empresas/{empresa_id}/modulos", response_model=EmpresaModulosResponse)
def patch_empresa_modulos(
    empresa_id: int,
    body: EmpresaModulosUpdate,
    perms: tuple[User, Session] = Depends(require_admin),
) -> Any:
    current_user, db = perms
    empresa = _get_empresa_or_404(db, empresa_id)

    stored: dict[str, bool] = dict(empresa.modulos_enabled or {})
    accumulated: dict[str, bool] = {}

    for slug, target in body.modulos.items():
        if slug not in OPTIONAL_MODULES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "unknown_slug", "slug": slug},
            )
        current_view = {**stored, **accumulated}
        if target:
            try:
                validate_toggle(current_view, slug, True)
            except ModuloValidationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"error": "dependency_violation", "slug": exc.slug, "message": str(exc)},
                )
            accumulated[slug] = True
        else:
            cascade = compute_cascade(current_view, slug, False)
            accumulated.update(cascade)

    new_stored = {**stored, **accumulated}

    # Compute real delta vs original stored state
    actual_diff = {
        s: v
        for s, v in accumulated.items()
        if stored.get(s, False) != v
    }

    empresa.modulos_enabled = new_stored
    db.add(empresa)

    if actual_diff:
        diff_list = [
            {"slug": s, "before": stored.get(s, False), "after": v}
            for s, v in actual_diff.items()
        ]
        db.add(AuditLog(
            user_id=current_user.id,
            action="modulos.toggle",
            entity_type="Empresa",
            entity_id=str(empresa_id),
            diff_json={"diff": diff_list},
        ))

    db.commit()
    db.refresh(empresa)

    final_stored: dict[str, bool] = empresa.modulos_enabled or {}
    return EmpresaModulosResponse(
        stored=final_stored,
        effective=compute_effective_modulos(final_stored),
        registry=_build_registry(),
    )


# ---------------------------------------------------------------------------
# GET /me/modulos  (any authenticated user)
# ---------------------------------------------------------------------------

@router.get("/me/modulos", response_model=MeModulosResponse)
def get_me_modulos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    empresa = db.get(Empresa, current_user.empresa_id) if current_user.empresa_id else None
    stored: dict[str, bool] = (empresa.modulos_enabled or {}) if empresa else {}
    return MeModulosResponse(effective=compute_effective_modulos(stored))
