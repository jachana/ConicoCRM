from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.deps import require_permission
from app.database import get_db
from app.models.cotizacion import Cotizacion
from app.models.nota_alerta import NotaAlerta, EstadoAlerta
from app.models.user import User
from app.schemas.nota_alerta import (
    NotaAlertaCreate,
    NotaAlertaOut,
    NotaAlertaUpdate,
)

router = APIRouter()


@router.post("/{cotizacion_id}/alertas", response_model=NotaAlertaOut, status_code=status.HTTP_201_CREATED)
def crear_alerta(
    cotizacion_id: int,
    body: NotaAlertaCreate,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    """Create a new alert for a quotation."""
    current_user, db = perms

    # Verify quotation exists
    cot = db.get(Cotizacion, cotizacion_id)
    if not cot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cotización no encontrada"
        )

    # Create the alert
    alerta = NotaAlerta(
        cotizacion_id=cotizacion_id,
        contenido=body.contenido,
    )
    db.add(alerta)
    db.commit()
    db.refresh(alerta)

    return alerta


@router.get("/{cotizacion_id}/alertas", response_model=list[NotaAlertaOut])
def listar_alertas(
    cotizacion_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    """List all alerts for a quotation."""
    current_user, db = perms

    # Verify quotation exists
    cot = db.get(Cotizacion, cotizacion_id)
    if not cot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cotización no encontrada"
        )

    alertas = db.query(NotaAlerta).filter(
        NotaAlerta.cotizacion_id == cotizacion_id
    ).order_by(NotaAlerta.created_at.desc()).all()

    return alertas


@router.patch("/{cotizacion_id}/alertas/{alerta_id}", response_model=NotaAlertaOut)
def actualizar_alerta(
    cotizacion_id: int,
    alerta_id: int,
    body: NotaAlertaUpdate,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    """Update an alert's content or status."""
    current_user, db = perms

    # Verify quotation exists
    cot = db.get(Cotizacion, cotizacion_id)
    if not cot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cotización no encontrada"
        )

    # Get the alert
    alerta = db.query(NotaAlerta).filter(
        NotaAlerta.id == alerta_id,
        NotaAlerta.cotizacion_id == cotizacion_id
    ).first()

    if not alerta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerta no encontrada"
        )

    # Update fields
    if body.contenido is not None:
        alerta.contenido = body.contenido

    if body.estado is not None:
        # Validate estado
        valid_estados = {e.value for e in EstadoAlerta}
        if body.estado not in valid_estados:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Estado inválido. Valores válidos: {', '.join(sorted(valid_estados))}"
            )
        alerta.estado = body.estado

    db.commit()
    db.refresh(alerta)

    return alerta


@router.delete("/{cotizacion_id}/alertas/{alerta_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_alerta(
    cotizacion_id: int,
    alerta_id: int,
    perms: tuple[User, Session] = require_permission("cotizaciones", "view"),
):
    """Delete an alert."""
    current_user, db = perms

    # Verify quotation exists
    cot = db.get(Cotizacion, cotizacion_id)
    if not cot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cotización no encontrada"
        )

    # Get the alert
    alerta = db.query(NotaAlerta).filter(
        NotaAlerta.id == alerta_id,
        NotaAlerta.cotizacion_id == cotizacion_id
    ).first()

    if not alerta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerta no encontrada"
        )

    db.delete(alerta)
    db.commit()
